import {
	transformGlobalToTimelinePosition,
	getTimelineYBoundsFromPaths,
	timelineKeyframesToPathList,
	getControlPointAsVector,
} from "~/timeline/timelineUtils";
import { Timeline, TimelineKeyframeControlPoint } from "~/timeline/timelineTypes";
import {
	getDistance as _getDistance,
	capToRange,
	interpolate,
	getDistance,
	getAngleRadians,
	rotateVec2CCW,
} from "~/util/math";
import { requestAction, RequestActionParams } from "~/listener/requestAction";
import { timelineActions } from "~/timeline/timelineActions";
import { isKeyDown } from "~/listener/keyboard";
import { animate } from "~/util/animation/animate";
import { areaActions } from "~/area/state/areaActions";
import { timelineEditorAreaActions } from "~/timeline/timelineEditorAreaState";
import { createToTimelineViewportY, createToTimelineViewportX } from "~/timeline/renderTimeline";
import { getActionState } from "~/state/stateUtils";
import { TIMELINE_CANVAS_HEIGHT_REDUCTION } from "~/timeline/TimelineEditor.styles";

const PAN_FAC = 0.0004;
const ZOOM_FAC = 0.25;
const MIN_DIST = 6;

const actions = {
	keyframeMouseDown: (
		{ dispatch, addListener, submitAction }: RequestActionParams,
		initialMousePos: Vec2,
		index: number,
		options: {
			timeline: Timeline;
			viewBounds: [number, number];
			viewport: Rect;
		},
	) => {
		const { timeline, viewport } = options;
		const keyframe = timeline.keyframes[index];

		const shiftKeyDownAtMouseDown = isKeyDown("Shift");

		if (shiftKeyDownAtMouseDown) {
			dispatch(timelineActions.toggleKeyframeSelection(timeline.id, keyframe.id));
		} else if (!timeline.selection.keyframes[keyframe.id]) {
			// If the current node is not selected, we clear the node selectction state
			// and add the clicked node to the selection.
			dispatch(timelineActions.clearSelection(timeline.id));
			dispatch(timelineActions.toggleKeyframeSelection(timeline.id, keyframe.id));
		}

		const paths = timelineKeyframesToPathList(timeline.keyframes);
		const yBounds = getTimelineYBoundsFromPaths(paths);

		dispatch(timelineActions.setYBounds(timeline.id, yBounds));
		dispatch(timelineActions.setYPan(timeline.id, 0));

		let yPan = 0;
		let hasMoved = false;
		let mousePos: Vec2;
		let lastUsedMousePos: Vec2;
		let lastShift = isKeyDown("Shift");
		let hasSubmitted = false;

		addListener.repeated("mousemove", (e) => {
			if (!hasMoved) {
				hasMoved = true;
			}

			mousePos = Vec2.fromEvent(e);
		});

		const tick = () => {
			if (hasSubmitted) {
				return;
			}

			requestAnimationFrame(tick);

			if (!hasMoved) {
				return;
			}

			let shouldAlwaysUpdate = false;

			if (lastShift !== isKeyDown("Shift")) {
				lastShift = !lastShift;
				shouldAlwaysUpdate = true;
			}

			const buffer = 5;
			const boundsDiff = Math.abs(yBounds[0] - yBounds[1]);
			const yUpper = Math.max(0, viewport.top + 40 - (mousePos.y - buffer));
			const yLower = Math.max(0, mousePos.y + buffer - (viewport.top + viewport.height));

			if (yLower) {
				shouldAlwaysUpdate = true;
				yPan -= yLower * boundsDiff * PAN_FAC;
				dispatch(timelineActions.setYPan(timeline.id, yPan));
			} else if (yUpper) {
				shouldAlwaysUpdate = true;
				yPan += yUpper * boundsDiff * PAN_FAC;
				dispatch(timelineActions.setYPan(timeline.id, yPan));
			}

			if (shouldAlwaysUpdate || lastUsedMousePos !== mousePos) {
				lastUsedMousePos = mousePos;
				let moveVector = mousePos
					.apply((vec) => transformGlobalToTimelinePosition(vec, options))
					.addY(yPan);

				moveVector.y = Math.min(
					yBounds[0] + yPan + yUpper * boundsDiff * PAN_FAC,
					moveVector.y,
				);
				moveVector.y = Math.max(
					yBounds[1] + yPan - yLower * boundsDiff * PAN_FAC,
					moveVector.y,
				);

				moveVector = moveVector.sub(initialMousePos);

				dispatch(
					timelineActions.setIndexAndValueShift(
						timeline.id,
						Math.round(moveVector.x),
						moveVector.y,
					),
				);
			}
		};
		requestAnimationFrame(tick);

		addListener.once("mouseup", () => {
			hasSubmitted = true;
			dispatch(timelineActions.setYBounds(timeline.id, null));
			dispatch(timelineActions.setYPan(timeline.id, 0));
			dispatch(timelineActions.submitIndexAndValueShift(timeline.id));
			submitAction("Select keyframe");
		});
	},

	keyframeAltMouseDown: (
		params: RequestActionParams,
		index: number,
		initialPos: Vec2,
		options: {
			timeline: Timeline;
			viewBounds: [number, number];
			viewport: Rect;
		},
	) => {
		const { timeline } = options;
		const { dispatch, addListener, removeListener, submitAction } = params;

		let upToken: string;
		const moveToken = addListener.repeated("mousemove", (e) => {
			const mousePos = Vec2.fromEvent(e);
			if (getDistance(initialPos, mousePos) > 3) {
				removeListener(moveToken);
				removeListener(upToken);
				actions.controlPointMouseDown(
					params,
					index,
					mousePos.x < initialPos.x ? "left" : "right",
					{
						...options,
						reflect: true,
						reflectLength: true,
					},
				);
			}
		});
		upToken = addListener.once("mouseup", () => {
			dispatch(timelineActions.setKeyframeControlPoint(timeline.id, index, "left", null));
			dispatch(timelineActions.setKeyframeControlPoint(timeline.id, index, "right", null));
			dispatch(timelineActions.setKeyframeReflectControlPoints(timeline.id, index, true));
			submitAction("Remove keyframe control points");
		});
	},

	controlPointMouseDown: (
		{ addListener, dispatch, cancelAction, submitAction }: RequestActionParams,
		index: number,
		direction: "left" | "right",
		options: {
			reflect?: boolean;
			reflectLength?: boolean;
			timeline: Timeline;
			viewBounds: [number, number];
			viewport: Rect;
		},
	) => {
		const { timeline, viewport, viewBounds, reflectLength = false } = options;

		let reflect = options.reflect;

		if (typeof reflect !== "boolean") {
			const shouldReflect = timeline.keyframes[index].reflectControlPoints;
			reflect = isKeyDown("Alt") ? !shouldReflect : shouldReflect;
		}

		const k = timeline.keyframes[index];
		const right = direction === "right";

		// If other control point doesn't exist, we can't reflect it.
		if (reflect && !(right ? k.controlPointLeft : k.controlPointRight)) {
			reflect = false;
		}

		const altDownAtMouseDown = isKeyDown("Alt");
		const k0 = timeline.keyframes[index + (right ? 0 : -1)];
		const k1 = timeline.keyframes[index + (right ? 0 : -1) + 1];
		const dist = k1.index - k0.index;
		const kDiff = k1.value - k0.value;

		const paths = timelineKeyframesToPathList(timeline.keyframes);
		const yBounds = getTimelineYBoundsFromPaths(paths);

		dispatch(timelineActions.setYBounds(timeline.id, yBounds));
		dispatch(timelineActions.setYPan(timeline.id, 0));
		dispatch(timelineActions.setKeyframeReflectControlPoints(timeline.id, index, reflect));

		const setControlPoint = (dir: "left" | "right", cp: TimelineKeyframeControlPoint) => {
			dispatch(timelineActions.setKeyframeControlPoint(timeline.id, index, dir, cp));
		};

		let yPan = 0;
		let hasMoved = false;
		let mousePos: Vec2;
		let lastUsedMousePos: Vec2;
		let lastShift = isKeyDown("Shift");
		let hasSubmitted = false;

		addListener.repeated("mousemove", (e) => {
			hasMoved = true;
			mousePos = Vec2.fromEvent(e);
		});

		const tick = () => {
			if (hasSubmitted) {
				return;
			}
			requestAnimationFrame(tick);

			if (!hasMoved) {
				return;
			}

			let shouldAlwaysUpdate = false;

			if (lastShift !== isKeyDown("Shift")) {
				lastShift = !lastShift;
				shouldAlwaysUpdate = true;
			}

			const buffer = 5;
			const boundsDiff = Math.abs(yBounds[0] - yBounds[1]);
			const yUpper = Math.max(0, viewport.top + 40 - (mousePos.y - buffer));
			const yLower = Math.max(0, mousePos.y + buffer - (viewport.top + viewport.height));

			if (yLower) {
				shouldAlwaysUpdate = true;
				yPan -= yLower * boundsDiff * PAN_FAC;
				dispatch(timelineActions.setYPan(timeline.id, yPan));
			} else if (yUpper) {
				shouldAlwaysUpdate = true;
				yPan += yUpper * boundsDiff * PAN_FAC;
				dispatch(timelineActions.setYPan(timeline.id, yPan));
			}

			if (!shouldAlwaysUpdate && lastUsedMousePos === mousePos) {
				return;
			}

			lastUsedMousePos = mousePos;

			const capToBoundsY = (vec: Vec2): Vec2 => {
				const newVec = vec.copy();
				newVec.y = capToRange(
					yBounds[1] + yPan - yLower * boundsDiff * PAN_FAC,
					yBounds[0] + yPan + yUpper * boundsDiff * PAN_FAC,
					newVec.y,
				);
				return newVec;
			};

			let moveVector = transformGlobalToTimelinePosition(mousePos, options)
				.addY(yPan)
				.apply(capToBoundsY);

			let tx = capToRange(0, 1, (moveVector.x - k0.index) / dist);
			const ty = (moveVector.y - k0.value) / kDiff;

			let value = kDiff * ty - (right ? 0 : kDiff);
			if (lastShift) {
				value = 0;
			}

			setControlPoint(direction, { tx, value, relativeToDistance: dist });

			// If we are not reflecting or at start/end of timeline, we are done.
			if (!reflect || !timeline.keyframes[index + (right ? -1 : 1)]) {
				return;
			}

			const _k0 = timeline.keyframes[index + (right ? -1 : 0)];
			const _k1 = timeline.keyframes[index + (right ? -1 : 0) + 1];
			const _dist = _k1.index - _k0.index;

			const renderOptions = {
				timeline: getActionState().timelines[timeline.id],
				height: viewport.height - TIMELINE_CANVAS_HEIGHT_REDUCTION,
				width: viewport.width,
				viewBounds,
			};
			const toViewportY = createToTimelineViewportY(renderOptions);
			const toViewportX = createToTimelineViewportX(renderOptions);
			const toViewport = (vec: Vec2) => Vec2.new(toViewportX(vec.x), toViewportY(vec.y));

			const reflectAngle = () => {
				const cpl = k.controlPointLeft!;
				const cpr = k.controlPointRight!;

				const cprPos = (right
					? Vec2.new(interpolate(k0.index, k1.index, tx), k.value + value)
					: Vec2.new(interpolate(_k0.index, _k1.index, cpr.tx), k.value + cpr.value)
				).apply(toViewport);
				const cplPos = (right
					? Vec2.new(interpolate(_k0.index, _k1.index, cpl.tx), k.value + cpl.value)
					: Vec2.new(interpolate(k0.index, k1.index, tx), k.value + value)
				).apply(toViewport);

				let kpost = Vec2.new(k.index, k.value).apply(toViewport);

				// Get angle from k to cp
				const angle = getAngleRadians(kpost, right ? cprPos : cplPos);

				// Amplitude of the reflected cp
				const amplitude = getDistance(kpost, right ? cplPos : cprPos);

				const _moveVector = Vec2.new(amplitude, 0)
					.add(kpost)
					.apply((vec) => rotateVec2CCW(vec, angle - Math.PI, kpost))
					.addY(viewport.top + TIMELINE_CANVAS_HEIGHT_REDUCTION)
					.addX(viewport.left)
					.apply((vec) => transformGlobalToTimelinePosition(vec, options))
					.addY(yPan);

				const _tx = capToRange(0, 1, (_moveVector.x - _k0.index) / _dist);
				setControlPoint(right ? "left" : "right", {
					tx: _tx,
					value: _moveVector.y - k.value,
					relativeToDistance: _dist,
				});
			};

			const reflectAngleAndAmplitude = () => {
				setControlPoint(right ? "left" : "right", {
					tx: right
						? capToRange(0, 1, 1 - tx * (dist / _dist))
						: capToRange(0, 1, (1 - tx) * (dist / _dist)),
					value: -value,
					relativeToDistance: _dist,
				});
			};

			// If reflectLength, we create the reflected cp if it doesn't exist
			if (reflectLength) {
				reflectAngleAndAmplitude();
				return;
			}

			// Reflected cp must exist for only its angle to be reflected
			if (timeline.keyframes[index][right ? "controlPointRight" : "controlPointLeft"]) {
				reflectAngle();
			}
		};
		requestAnimationFrame(tick);

		addListener.once("mouseup", () => {
			hasSubmitted = true;
			dispatch(timelineActions.setYBounds(timeline.id, null));
			dispatch(timelineActions.setYPan(timeline.id, 0));

			if (!hasMoved) {
				if (!altDownAtMouseDown) {
					cancelAction();
					return;
				}

				dispatch(
					timelineActions.setKeyframeControlPoint(timeline.id, index, direction, null),
				);
				submitAction("Remove control point");
				return;
			}

			submitAction("Move control point");
		});
	},
};

export const timelineHandlers = {
	onMouseDown: (
		e: React.MouseEvent,
		options: {
			timeline: Timeline;
			viewBounds: [number, number];
			viewport: Rect;
		},
	) => {
		const { timeline } = options;

		e.preventDefault();
		const initialPos = Vec2.fromEvent(e);

		const mousePos = transformGlobalToTimelinePosition(initialPos, options);
		let getDistanceInPx: (a: Vec2, b: Vec2) => number;
		{
			const p0 = transformGlobalToTimelinePosition(Vec2.new(0, 0), options);
			const p1 = transformGlobalToTimelinePosition(Vec2.new(1, 1), options);

			const xt = p1.x - p0.x;
			const yt = p1.y - p0.y;

			getDistanceInPx = (a, b) => {
				const aScaled = a.scaleX(yt / xt).scale(1 / yt);
				const bScaled = b.scaleX(yt / xt).scale(1 / yt);
				return _getDistance(aScaled, bScaled);
			};
		}

		const keyframes = timeline.keyframes;

		// Check whether a control point was clicked
		for (let i = 0; i < keyframes.length - 1; i += 1) {
			const k0 = keyframes[i];
			const k1 = keyframes[i + 1];

			const cp0 = getControlPointAsVector("cp0", k0, k1);
			const cp1 = getControlPointAsVector("cp1", k0, k1);

			if (cp0 && getDistanceInPx(cp0, mousePos) < MIN_DIST) {
				timelineHandlers.onControlPointMouseDown(i, "right", options);
				return;
			}

			if (cp1 && getDistanceInPx(cp1, mousePos) < MIN_DIST) {
				timelineHandlers.onControlPointMouseDown(i + 1, "left", options);
				return;
			}
		}

		// Check whether a keyframe was clicked
		for (let i = 0; i < keyframes.length; i += 1) {
			const keyframe = keyframes[i];
			const keyframePos = Vec2.new(keyframe.index, keyframe.value);
			console.log(i, getDistanceInPx(keyframePos, mousePos));
			if (getDistanceInPx(keyframePos, mousePos) < MIN_DIST) {
				if (isKeyDown("Alt")) {
					requestAction({ history: true }, (params) => {
						actions.keyframeAltMouseDown(params, i, initialPos, options);
					});
					return;
				}

				timelineHandlers.onKeyframeMouseDown(mousePos, i, options);
				return;
			}
		}

		requestAction({ history: true }, ({ dispatch, submitAction }) => {
			dispatch(timelineActions.clearSelection(timeline.id));
			submitAction("Clear timeline selection");
		});
	},

	onControlPointMouseDown: (
		index: number,
		direction: "left" | "right",
		options: {
			reflect?: boolean;
			timeline: Timeline;
			viewBounds: [number, number];
			viewport: Rect;
		},
	) => {
		requestAction({ history: true }, (params) => {
			actions.controlPointMouseDown(params, index, direction, options);
		});
	},

	onKeyframeMouseDown: (
		initialMousePos: Vec2,
		index: number,
		options: {
			timeline: Timeline;
			viewBounds: [number, number];
			viewport: Rect;
		},
	) => {
		requestAction({ history: true }, (params) => {
			actions.keyframeMouseDown(params, initialMousePos, index, options);
		});
	},

	onZoomClick: (
		e: React.MouseEvent,
		areaId: string,
		options: {
			timeline: Timeline;
			viewBounds: [number, number];
			viewport: Rect;
		},
	) => {
		const { viewBounds, viewport } = options;

		const mousePos = Vec2.fromEvent(e).subX(viewport.left);
		const t = mousePos.x / viewport.width;

		let newBounds: [number, number];

		if (isKeyDown("Alt")) {
			const add = Math.abs(viewBounds[0] - viewBounds[1]) * ZOOM_FAC;
			newBounds = [
				capToRange(0, 1, viewBounds[0] - add * t),
				capToRange(0, 1, viewBounds[1] + add * (1 - t)),
			];
		} else {
			const remove = Math.abs(viewBounds[0] - viewBounds[1]) * ZOOM_FAC;
			newBounds = [viewBounds[0] + remove * t, viewBounds[1] - remove * (1 - t)];
		}

		requestAction({ history: false }, ({ dispatch, submitAction }) => {
			animate({ duration: 0 }, (t) => {
				dispatch(
					areaActions.dispatchToAreaState(
						areaId,
						timelineEditorAreaActions.setViewBounds([
							interpolate(viewBounds[0], newBounds[0], t),
							interpolate(viewBounds[1], newBounds[1], t),
						]),
					),
				);
			}).then(() => submitAction());
		});
	},
};