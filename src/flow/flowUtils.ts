import { FlowGraph, FlowNodeType } from "~/flow/flowTypes";
import { removeKeysFromMap } from "~/util/mapUtils";

const flowNodeTypeToLabel: Record<FlowNodeType, string> = {
	[FlowNodeType.array_modifier_index]: "Index",
	[FlowNodeType.color_from_rgba_factors]: "Color from RGBA",
	[FlowNodeType.color_input]: "Color Input",
	[FlowNodeType.color_to_rgba_factors]: "RGBA from Color",
	[FlowNodeType.composition]: "Composition",
	[FlowNodeType.deg_to_rad]: "Degrees to Radians",
	[FlowNodeType.empty]: "Empty",
	[FlowNodeType.expr]: "Expression",
	[FlowNodeType.num_cap]: "Cap number",
	[FlowNodeType.num_input]: "Number input",
	[FlowNodeType.num_lerp]: "Number interpolation",
	[FlowNodeType.property_input]: "Property Input",
	[FlowNodeType.property_output]: "Property Output",
	[FlowNodeType.rad_to_deg]: "Radians to Degrees",
	[FlowNodeType.rect_translate]: "Translate Rect",
	[FlowNodeType.vec2_add]: "Add Vec2",
	[FlowNodeType.vec2_factors]: "Vec2 Factors",
	[FlowNodeType.vec2_input]: "Vec2 Input",
	[FlowNodeType.vec2_lerp]: "Vec2 interpolation",
};

export const getFlowNodeLabel = (type: FlowNodeType): string => {
	return flowNodeTypeToLabel[type];
};

export const flowEditorGlobalToNormal = (
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

export const flowEditorGlobalToNormalRect = (
	globalRect: Rect,
	viewport: Rect,
	scale: number,
	pan: Vec2,
): Rect => {
	let { left, top, width, height } = globalRect;
	left -= viewport.left;
	top -= viewport.top;
	left /= scale;
	top /= scale;
	left -= pan.x / scale;
	top -= pan.y / scale;
	left -= viewport.width / 2 / scale;
	top -= viewport.height / 2 / scale;
	width *= scale;
	height *= scale;
	return { left, top, width, height };
};

export const flowEditorPositionToViewport = (
	vec2: Vec2,
	options: { viewport: Rect; scale: number; pan: Vec2 },
): Vec2 => {
	return vec2
		.scale(options.scale)
		.add(options.pan)
		.add(Vec2.new(options.viewport.width / 2, options.viewport.height / 2));
};

export const findInputsThatReferenceFlowNodeOutputs = (nodeId: string, graph: FlowGraph) => {
	const results: Array<{ nodeId: string; inputIndex: number }> = [];

	for (const key in graph.nodes) {
		const node = graph.nodes[key];

		for (let i = 0; i < node.inputs.length; i += 1) {
			const input = node.inputs[i];

			if (!input.pointer) {
				continue;
			}

			if (input.pointer.nodeId === nodeId) {
				results.push({ inputIndex: i, nodeId: key });
			}
		}
	}

	return results;
};

export const removeReferencesToNodeInFlowGraph = (nodeId: string, graph: FlowGraph): FlowGraph => {
	const refs = findInputsThatReferenceFlowNodeOutputs(nodeId, graph);

	const newGraph: FlowGraph = {
		...graph,
		nodes: { ...graph.nodes },
	};

	for (let i = 0; i < refs.length; i += 1) {
		const { inputIndex, nodeId } = refs[i];

		const node = newGraph.nodes[nodeId];

		newGraph.nodes[nodeId] = {
			...node,
			inputs: node.inputs.map((input, i) =>
				i === inputIndex
					? {
							...input,
							pointer: null,
					  }
					: input,
			),
		};
	}

	return newGraph;
};

export const removeNodeAndReferencesToItInFlowGraph = (
	nodeId: string,
	graph: FlowGraph,
): FlowGraph => {
	let newGraph = removeReferencesToNodeInFlowGraph(nodeId, graph);

	newGraph = {
		...graph,
		nodes: removeKeysFromMap(newGraph.nodes, [nodeId]),
	};

	return newGraph;
};
