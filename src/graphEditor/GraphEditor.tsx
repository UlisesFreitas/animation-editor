import React, { useLayoutEffect, useRef } from "react";
import { cssVariables } from "~/cssVariables";
import { timelineHandlers } from "~/graphEditor/graphEditorHandlers";
import { renderGraphEditor } from "~/graphEditor/renderGraphEditor";
import { connectActionState } from "~/state/stateUtils";
import { TimelineSelectionState } from "~/timeline/timelineSelectionReducer";
import { Timeline } from "~/timeline/timelineTypes";
import { applyTimelineIndexAndValueShifts } from "~/timeline/timelineUtils";
import { separateLeftRightMouse } from "~/util/mouse";

interface OwnProps {
	ids: string[];
	colors: Partial<{ [timelineId: string]: string }>;
	length: number;
	viewBounds: [number, number];
	viewport: Rect;
	dragSelectRect: Rect | null;
	timelineAreaId: string;
}
interface StateProps {
	timelines: Timeline[];
	timelineSelectionState: TimelineSelectionState;
}
type Props = OwnProps & StateProps;

const GraphEditorComponent: React.FC<Props> = (props) => {
	const {
		viewport,
		length,
		timelineSelectionState: timelineSelectionState,
		colors,
		dragSelectRect,
	} = props;

	const canvasRef = useRef<HTMLCanvasElement>(null);

	useLayoutEffect(() => {
		const ctx = canvasRef.current?.getContext("2d");

		if (!ctx) {
			return;
		}

		const { width, height } = viewport;

		const timelines = props.timelines.map((timeline) =>
			applyTimelineIndexAndValueShifts(timeline, props.timelineSelectionState[timeline.id]),
		);

		renderGraphEditor({
			ctx,
			length,
			width,
			height,
			timelines,
			colors,
			viewBounds,
			timelineSelectionState: timelineSelectionState,
			dragSelectRect,
		});
	}, [props]);

	const { viewBounds } = props;
	const { width, height } = viewport;

	return (
		<div style={{ background: cssVariables.gray400 }}>
			<canvas
				ref={canvasRef}
				height={height}
				width={width}
				onMouseDown={separateLeftRightMouse({
					left: (e) =>
						timelineHandlers.onMouseDown(e, {
							timelineAreaId: props.timelineAreaId,
							timelines: props.timelines,
							length,
							viewBounds,
							viewport,
						}),
				})}
			/>
		</div>
	);
};

const mapStateToProps: MapActionState<StateProps, OwnProps> = (
	{ timelineState, timelineSelectionState },
	ownProps,
) => ({
	timelines: ownProps.ids.map((id) => timelineState[id]),
	timelineSelectionState: timelineSelectionState,
});

export const GraphEditor = connectActionState(mapStateToProps)(GraphEditorComponent);
