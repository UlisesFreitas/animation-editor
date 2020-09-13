import { getLayerDimensions, getLayerNameToProperty } from "~/composition/layer/layerUtils";
import { transformMat2 } from "~/composition/transformUtils";
import { getCompSelectionFromState } from "~/composition/util/compSelectionUtils";
import { getPathIdToShapeGroupId, getShapeLayerPathIds, pathIdToCurves } from "~/shape/shapeUtils";
import { CompositionRenderValues, LayerType } from "~/types";
import { boundingRectOfRects, rectCorners } from "~/util/math";
import { pathBoundingRect } from "~/util/math/boundingRect";

export const globalToWorkspacePosition = (
	globalPosition: Vec2,
	viewport: Rect,
	scale: number,
	pan: Vec2,
): Vec2 => {
	let { x, y } = globalPosition;
	x -= viewport.left;
	y -= viewport.top;
	x /= scale;
	y /= scale;
	x -= pan.x / scale;
	y -= pan.y / scale;
	x -= viewport.width / 2 / scale;
	y -= viewport.height / 2 / scale;
	return Vec2.new(x, y);
};

const getShapeLayerRect = (layerId: string, actionState: ActionState) => {
	const {
		compositionState,
		compositionSelectionState,
		shapeState,
		shapeSelectionState,
	} = actionState;
	const layer = compositionState.layers[layerId];
	const composition = compositionState.compositions[layer.compositionId];
	const compositionSelection = getCompSelectionFromState(
		composition.id,
		compositionSelectionState,
	);
	const pathIds = getShapeLayerPathIds(layerId, compositionState);
	const pathIdToShapeGroupId = getPathIdToShapeGroupId(layer.id, compositionState);
	const rects = pathIds
		.map((pathId) => {
			const shapeGroupId = pathIdToShapeGroupId[pathId];
			const shapeSelected = compositionSelection.properties[shapeGroupId];
			const shapeMoveVector = shapeSelected ? composition.shapeMoveVector : Vec2.ORIGIN;
			return pathIdToCurves(pathId, shapeState, shapeSelectionState, shapeMoveVector);
		})
		.filter(Boolean)
		.map((curves) => pathBoundingRect(curves!));
	return boundingRectOfRects(rects);
};

export const workspaceLayerBoundingBoxCorners = (
	layerId: string,
	map: CompositionRenderValues,
	actionState: ActionState,
	pan: Vec2,
	scale: number,
) => {
	const { compositionState } = actionState;

	const transform = map.transforms[layerId].transform[0];
	const mat2 = transformMat2(transform);

	const layer = compositionState.layers[layerId];
	if (layer.type === LayerType.Shape) {
		const rect = getShapeLayerRect(layerId, actionState);
		const mat2 = transformMat2(transform);
		return rectCorners(rect).map((p) =>
			mat2.multiply(p).add(transform.translate).scale(scale).add(pan),
		);
	}

	const nameToProperty = getLayerNameToProperty(map, compositionState, layerId);
	const [width, height] = getLayerDimensions(layer.type, nameToProperty);

	const corners = [
		[1, 0],
		[1, 1],
		[0, 1],
		[0, 0],
	].map(([tx, ty]) => {
		let x = tx * width - transform.anchor.x;
		let y = ty * height - transform.anchor.y;

		if (layer.type === LayerType.Ellipse) {
			const r = nameToProperty.OuterRadius;
			x -= r;
			y -= r;
		}

		return mat2.multiply(Vec2.new(x, y)).add(transform.translate).scale(scale).add(pan);
	});

	return corners;
};