import * as mathjs from "mathjs";
import { EvalFunction } from "mathjs";
import { CompositionState } from "~/composition/compositionReducer";
import { getPropertyIdsAffectedByNodes } from "~/composition/property/getPropertyIdsAffectedByNodes";
import { FlowNodeState } from "~/flow/flowNodeState";
import { FlowNode, FlowNodeType } from "~/flow/flowTypes";
import { getFlowPropertyNodeReferencedPropertyIds } from "~/flow/flowUtils";
import { findGraphOutputNodes } from "~/flow/graph/graphOutputNodes";

function propertyOutputNodeHasAffectedProperty(
	findPropertyId: string,
	outputNode: FlowNode<FlowNodeType.property_output>,
	compositionState: CompositionState,
): boolean {
	if (!outputNode.state.propertyId) {
		// A property has not been selected for the output node.
		return false;
	}

	const p = compositionState.properties[outputNode.state.propertyId];

	if (p.type === "property") {
		// Check if `property_output` node directly references the property that
		// the `property_input` node refenreces.
		return p.id === findPropertyId;
	}

	if (p.type === "compound") {
		if (p.id === findPropertyId) {
			// `property_output` node directly references the property that
			// the `property_input` node refenreces.
			return true;
		}
		for (const id of p.properties) {
			if (id === findPropertyId) {
				// The `property_output` node references a sub-property of
				// the compound property that `property_input` references.
				return true;
			}
		}
		return false;
	}

	for (const propertyId of p.properties) {
		const p = compositionState.properties[propertyId];

		if (p.type === "group") {
			// `property_output` nodes don't allow nested groups.
			continue;
		}
		if (p.id === findPropertyId) {
			return true;
		}
		if (p.type === "compound") {
			for (const id of p.properties) {
				if (id === findPropertyId) {
					// The `property_output` node references a group sub-property of
					// the compound property within the property group that `property_input`
					// references.
					return true;
				}
			}
		}
	}

	return false;
}

export interface LayerGraphsInfo {
	/**
	 * Every node that needs to be computed in the graph in the order
	 * that they need to be computed in.
	 */
	toCompute: string[];
	nodeToNext: Record<string, string[]>;
	nodeToIndex: Record<string, number>;
	expressions: Record<string, EvalFunction>;
	nodeIdsThatEmitFrameIndex: string[];
	propertyIdToAffectedInputNodes: Partial<Record<string, string[]>>;
	compareNodeIds: (a: string, b: string) => number;
	propertyIdsAffectedByFrameIndexByLayer: Record<string, string[]>;
}

export const resolveCompositionLayerGraphs = (
	compositionId: string,
	actionState: ActionState,
): LayerGraphsInfo => {
	const { compositionState, flowState } = actionState;

	const visitedByGraph: Record<string, Set<string>> = {};

	const composition = compositionState.compositions[compositionId];

	// Create a visited set for each graph
	for (const layerId of composition.layers) {
		const layer = compositionState.layers[layerId];
		if (layer.graphId) {
			visitedByGraph[layer.graphId] = new Set();
		}
	}

	const toCompute: string[] = [];
	const graphToOutputNodes: Record<string, FlowNode<FlowNodeType.property_output>[]> = {};
	const nodeToNext: LayerGraphsInfo["nodeToNext"] = {};
	const propertyIdToAffectedInputNodes: LayerGraphsInfo["propertyIdToAffectedInputNodes"] = {};
	const nodeIdsThatEmitFrameIndex: string[] = [];
	const expressions: Record<string, EvalFunction> = {};

	function dfs(node: FlowNode, visitedInTrip: Set<string>) {
		if (visitedByGraph[node.graphId].has(node.id)) {
			if (visitedInTrip.has(node.id)) {
				// The node was visited twice in one trip.
				//
				// Circular dependency.
				throw new Error(`Circular node dependency at '${node.id}'`);
			}

			// This node has been visited globally, but not in this trip.
			//
			// No work to be done.
			return;
		}

		visitedByGraph[node.graphId].add(node.id);
		visitedInTrip.add(node.id);

		for (const input of node.inputs) {
			if (input.pointer) {
				nodeToNext[input.pointer.nodeId].push(node.id);

				const nextNode = flowState.nodes[input.pointer.nodeId];
				dfs(nextNode, new Set(visitedInTrip));
			}
		}

		if (node.type === FlowNodeType.composition) {
			nodeIdsThatEmitFrameIndex.push(node.id);
		}
		if (node.type === FlowNodeType.property_input) {
			// Populate `propertyIdToAffectedInputNodes`
			const state = node.state as FlowNodeState<FlowNodeType.property_input>;
			const propertyIds = getFlowPropertyNodeReferencedPropertyIds(
				compositionState,
				state.propertyId,
			);
			for (const propertyId of propertyIds) {
				if (!propertyIdToAffectedInputNodes[propertyId]) {
					propertyIdToAffectedInputNodes[propertyId] = [];
				}
				propertyIdToAffectedInputNodes[propertyId]!.push(node.id);
			}
		}

		if (node.type === FlowNodeType.property_input) {
			// We encountered a `property_input` node.
			//
			// If the node references this layer, the `property_input` node returns
			// the raw value of the property, so we don't have to do any work.
			//
			// If the node references another layer, we need to follow the reference
			// to ensure that cross-layer references are computed in the right order.

			const state = node.state as FlowNodeState<FlowNodeType.property_input>;

			const thisGraph = flowState.graphs[node.graphId];
			const referencesThisLayer = thisGraph.layerId === state.layerId;
			const referencesSpecificLayerAndProperty = !!(state.layerId && state.propertyId);
			const referencedGraphId =
				referencesSpecificLayerAndProperty &&
				compositionState.layers[state.layerId].graphId;

			if (!referencesThisLayer && referencedGraphId) {
				// The node references the property of a different layer with a graph.
				//
				// See if the layer graph of that layer contains a `property_output`
				// node that affects the property we are specifically referencing.
				const graph = flowState.graphs[referencedGraphId];

				const outputNodes = findGraphOutputNodes(graph, flowState);

				for (const outputNode of outputNodes) {
					const affected = propertyOutputNodeHasAffectedProperty(
						state.propertyId,
						outputNode,
						compositionState,
					);
					if (!affected) {
						// The `property_output` node does not reference the `propertyId`
						// that the `property_input` node references.
						continue;
					}

					// There is a `property_output` node that affects the property
					// we are referencing via the `property_input` node.
					//
					// That means that this `property_output` node must be computed
					// before the current stack can be computed.
					//
					// Populate `nodeToNext` and run dfs on this node.
					nodeToNext[outputNode.id].push(node.id);
					dfs(outputNode, visitedInTrip);
				}
			}
		}

		toCompute.push(node.id);
	}

	// Populate `nodeToNext` and `expressions`
	for (const layerId of composition.layers) {
		const layer = compositionState.layers[layerId];
		if (!layer.graphId) {
			continue;
		}
		const graph = flowState.graphs[layer.graphId];
		for (const nodeId of graph.nodes) {
			nodeToNext[nodeId] = [];

			const node = flowState.nodes[nodeId];
			if (node.type === FlowNodeType.expr) {
				const state = node.state as FlowNodeState<FlowNodeType.expr>;
				const evalFn = mathjs.compile(state.expression);
				expressions[node.id] = evalFn;
			}
		}
	}

	// Run dfs on the output nodes of every graph
	for (const layerId of composition.layers) {
		const layer = compositionState.layers[layerId];
		if (!layer.graphId) {
			continue;
		}

		const { graphId } = layer;
		const graph = flowState.graphs[graphId];

		const outputNodes = findGraphOutputNodes(graph, flowState);
		graphToOutputNodes[graphId] = outputNodes;

		for (const outputNode of outputNodes) {
			dfs(outputNode, new Set());
		}
	}

	// Given a graph like so:
	//
	// A -> B -> C
	//   ↘         ↘
	//     D ------> E
	//
	// If A is updated and we compute the updates via DFS, then
	// D would not have been recomputed before E updates with
	// a stale value from D.
	//
	// Instead, we can determine which nodes to update via DFS, and
	// then sort them by their index in `toCompute` to get the order
	// to compute the node updates in.
	const nodeToIndex = toCompute.reduce<Record<string, number>>((acc, nodeId, i) => {
		acc[nodeId] = i;
		return acc;
	}, {});

	const propertyIdsAffectedByFrameIndexByLayer = getPropertyIdsAffectedByNodes(
		actionState,
		nodeIdsThatEmitFrameIndex,
		nodeToNext,
	).reduce<Record<string, string[]>>((acc, propertyId) => {
		const property = actionState.compositionState.properties[propertyId];
		if (!acc[property.layerId]) {
			acc[property.layerId] = [];
		}
		acc[property.layerId].push(property.id);
		return acc;
	}, {});

	return {
		toCompute,
		nodeToIndex,
		nodeToNext,
		expressions,
		propertyIdToAffectedInputNodes,
		nodeIdsThatEmitFrameIndex,
		propertyIdsAffectedByFrameIndexByLayer,
		compareNodeIds: (a, b) => nodeToIndex[a] - nodeToIndex[b],
	};
};