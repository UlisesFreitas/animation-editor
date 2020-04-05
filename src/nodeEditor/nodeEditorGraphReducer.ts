import { ActionType, getType } from "typesafe-actions";
import { nodeEditorGraphActions as actions } from "~/nodeEditor/nodeEditorGraphActions";
import {
	NodeEditorNode,
	getNodeEditorNodeDefaultInputs,
	getNodeEditorNodeDefaultOutputs,
	NodeEditorNodeInput,
} from "~/nodeEditor/nodeEditorIO";
import { NodeEditorNodeType } from "~/types";
import { rectsIntersect } from "~/util/math";
import { calculateNodeHeight } from "~/nodeEditor/util/calculateNodeHeight";
import { DEFAULT_NODE_EDITOR_NODE_WIDTH } from "~/constants";

export type NodeEditorGraphAction = ActionType<typeof actions>;

const createNodeId = (nodes: { [key: string]: any }) =>
	(
		Math.max(
			...Object.keys(nodes)
				.map((x) => parseInt(x))
				.filter((x) => !isNaN(x)),
		) + 1
	).toString();

type Selection = { [id: string]: true };

export interface NodeEditorGraphState {
	moveVector: Vec2;
	nodes: {
		[nodeId: string]: NodeEditorNode<NodeEditorNodeType>;
	};
	selection: {
		nodes: Selection;
	};
	_addNodeOfTypeOnClick: NodeEditorNodeType | null;
	_dragSelectRect: Rect | null;
	_dragOutputTo: {
		position: Vec2;
		fromOutput: { nodeId: string; outputIndex: number };
		wouldConnectToInput: {
			nodeId: string;
			inputIndex: number;
		} | null;
	} | null;
	_dragInputTo: {
		position: Vec2;
		fromInput: { nodeId: string; inputIndex: number };
		wouldConnectToOutput: {
			nodeId: string;
			outputIndex: number;
		} | null;
	} | null;
}

export const initialNodeEditorGraphState: NodeEditorGraphState = {
	moveVector: Vec2.new(0, 0),
	nodes: {
		0: {
			id: "0",
			type: NodeEditorNodeType.add_vec2,
			position: Vec2.new(-100, 0),
			width: DEFAULT_NODE_EDITOR_NODE_WIDTH,
			inputs: getNodeEditorNodeDefaultInputs(NodeEditorNodeType.add_vec2),
			outputs: getNodeEditorNodeDefaultOutputs(NodeEditorNodeType.add_vec2),
		},
		1: {
			id: "1",
			type: NodeEditorNodeType.translate_rect,
			position: Vec2.new(100, 100),
			width: DEFAULT_NODE_EDITOR_NODE_WIDTH,
			inputs: getNodeEditorNodeDefaultInputs(NodeEditorNodeType.translate_rect),
			outputs: getNodeEditorNodeDefaultOutputs(NodeEditorNodeType.translate_rect),
		},
	},
	selection: {
		nodes: {},
	},
	_addNodeOfTypeOnClick: null,
	_dragSelectRect: null,
	_dragOutputTo: null,
	_dragInputTo: null,
};

export function nodeEditorGraphReducer(
	state: NodeEditorGraphState,
	action: NodeEditorGraphAction,
): NodeEditorGraphState {
	switch (action.type) {
		case getType(actions.addNodeToSelection): {
			const { nodeId } = action.payload;
			return {
				...state,
				selection: {
					...state.selection,
					nodes: {
						...state.selection.nodes,
						[nodeId]: true,
					},
				},
			};
		}

		case getType(actions.removeNodeFromSelection): {
			const { nodeId } = action.payload;
			return {
				...state,
				selection: {
					...state.selection,
					nodes: Object.keys(state.selection.nodes).reduce<Selection>((obj, id) => {
						if (nodeId !== id) {
							obj[id] = true;
						}
						return obj;
					}, {}),
				},
			};
		}

		case getType(actions.toggleNodeSelection): {
			const { nodeId } = action.payload;
			return state.selection.nodes[nodeId]
				? nodeEditorGraphReducer(state, actions.removeNodeFromSelection(nodeId))
				: nodeEditorGraphReducer(state, actions.addNodeToSelection(nodeId));
		}

		case getType(actions.clearNodeSelection): {
			return {
				...state,
				selection: {
					...state.selection,
					nodes: {},
				},
			};
		}

		case getType(actions.setMoveVector): {
			const { moveVector } = action.payload;
			return { ...state, moveVector };
		}

		case getType(actions.applyMoveVector): {
			const { moveVector } = state;
			return {
				...state,
				moveVector: Vec2.new(0, 0),
				nodes: Object.keys(state.nodes).reduce<NodeEditorGraphState["nodes"]>(
					(obj, nodeId) => {
						const node = state.nodes[nodeId];

						obj[nodeId] = state.selection.nodes[nodeId]
							? { ...node, position: node.position.add(moveVector) }
							: node;

						return obj;
					},
					{},
				),
			};
		}

		case getType(actions.removeNode): {
			const { nodeId } = action.payload;
			return {
				...state,
				selection: {
					nodes: Object.keys(state.selection.nodes).reduce<Selection>((obj, key) => {
						if (key !== nodeId) {
							obj[key] = state.selection.nodes[key];
						}
						return obj;
					}, {}),
				},
				nodes: Object.keys(state.nodes).reduce<NodeEditorGraphState["nodes"]>(
					(obj, key) => {
						if (key !== nodeId) {
							obj[key] = state.nodes[key];
						}
						return obj;
					},
					{},
				),
			};
		}

		case getType(actions.startAddNode): {
			const { type } = action.payload;
			return { ...state, _addNodeOfTypeOnClick: type };
		}

		case getType(actions.submitAddNode): {
			const { position } = action.payload;
			const id = createNodeId(state.nodes);
			const type = state._addNodeOfTypeOnClick!;

			return {
				...state,
				_addNodeOfTypeOnClick: null,
				nodes: {
					...state.nodes,
					[id]: {
						id,
						type,
						position,
						width: DEFAULT_NODE_EDITOR_NODE_WIDTH,
						inputs: getNodeEditorNodeDefaultInputs(type),
						outputs: getNodeEditorNodeDefaultOutputs(type),
					},
				},
			};
		}

		case getType(actions.setDragSelectRect): {
			const { rect } = action.payload;
			return { ...state, _dragSelectRect: rect };
		}

		case getType(actions.submitDragSelectRect): {
			const { additiveSelection } = action.payload;

			return {
				...state,
				_dragSelectRect: null,
				selection: {
					...state.selection,
					nodes: Object.keys(state.nodes).reduce<{ [key: string]: true }>((obj, key) => {
						const node = state.nodes[key];
						const shouldBeSelected =
							(additiveSelection && state.selection.nodes[key]) ||
							rectsIntersect(state._dragSelectRect!, {
								left: node.position.x,
								top: node.position.y,
								height: calculateNodeHeight(node),
								width: node.width,
							});

						if (shouldBeSelected) {
							obj[key] = true;
						}

						return obj;
					}, {}),
				},
			};
		}

		case getType(actions.setDragSelectRect): {
			const { rect } = action.payload;
			return { ...state, _dragSelectRect: rect };
		}

		case getType(actions.initDragOutputTo): {
			const { position, fromOutput } = action.payload;
			return {
				...state,
				_dragOutputTo: {
					position,
					fromOutput,
					wouldConnectToInput: null,
				},
			};
		}

		case getType(actions.setDragOutputTo): {
			if (!state._dragOutputTo) {
				return state;
			}

			const { position, wouldConnectToInput } = action.payload;
			return {
				...state,
				_dragOutputTo: {
					...state._dragOutputTo,
					position,
					wouldConnectToInput,
				},
			};
		}

		case getType(actions.submitDragOutputTo): {
			if (!state._dragOutputTo?.wouldConnectToInput) {
				return state;
			}

			const { outputIndex, nodeId: outputNodeId } = state._dragOutputTo.fromOutput;
			const { inputIndex, nodeId: inputNodeId } = state._dragOutputTo.wouldConnectToInput;

			const inputNode = state.nodes[inputNodeId];

			return {
				...state,
				nodes: {
					...state.nodes,
					[inputNodeId]: {
						...inputNode,
						inputs: inputNode.inputs.map<NodeEditorNodeInput>((input, i) =>
							i === inputIndex
								? {
										...input,
										pointer: {
											nodeId: outputNodeId,
											outputIndex,
										},
								  }
								: input,
						),
					},
				},
				_dragOutputTo: null,
			};
		}

		case getType(actions.initDragInputTo): {
			const { position, fromInput } = action.payload;
			return {
				...state,
				_dragInputTo: {
					position,
					fromInput,
					wouldConnectToOutput: null,
				},
			};
		}

		case getType(actions.setDragInputTo): {
			if (!state._dragInputTo) {
				return state;
			}

			const { position, wouldConnectToOutput } = action.payload;
			return {
				...state,
				_dragInputTo: {
					...state._dragInputTo,
					position,
					wouldConnectToOutput,
				},
			};
		}

		case getType(actions.submitDragInputTo): {
			if (!state._dragInputTo?.wouldConnectToOutput) {
				return state;
			}

			const { inputIndex, nodeId: inputNodeId } = state._dragInputTo.fromInput;
			const { outputIndex, nodeId: outputNodeId } = state._dragInputTo.wouldConnectToOutput;

			const inputNode = state.nodes[inputNodeId];

			return {
				...state,
				nodes: {
					...state.nodes,
					[inputNodeId]: {
						...inputNode,
						inputs: inputNode.inputs.map<NodeEditorNodeInput>((input, i) =>
							i === inputIndex
								? {
										...input,
										pointer: {
											nodeId: outputNodeId,
											outputIndex,
										},
								  }
								: input,
						),
					},
				},
				_dragInputTo: null,
			};
		}

		case getType(actions.clearDragOutputTo): {
			return { ...state, _dragOutputTo: null };
		}

		case getType(actions.removeInputPointer): {
			const { nodeId, inputIndex } = action.payload;
			const node = state.nodes[nodeId];
			return {
				...state,
				nodes: {
					...state.nodes,
					[nodeId]: {
						...node,
						inputs: node.inputs.map<NodeEditorNodeInput>((input, i) =>
							i === inputIndex
								? {
										...input,
										pointer: null,
								  }
								: input,
						),
					},
				},
			};
		}

		default:
			return state;
	}
}