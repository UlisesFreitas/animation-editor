import React from "react";
import { CompTimePropertyValueContext } from "~/composition/timeline/compTimeContext";
import { useActionState } from "~/hook/useActionState";
import { useComputeHistory } from "~/hook/useComputeHistory";
import { computeLayerGraph } from "~/nodeEditor/graph/computeLayerGraph";
import { ComputeNodeContext } from "~/nodeEditor/graph/computeNode";

interface OwnProps {
	compositionId: string;
	layerId: string;
	graphId: string;
}
type Props = OwnProps;

export const CompTimeLayerPropertyToValue: React.FC<Props> = (props) => {
	const { compositionId, layerId, graphId } = props;

	const { computePropertyValues } = useComputeHistory((state) => {
		const graph = state.nodeEditor.graphs[graphId];
		return { computePropertyValues: computeLayerGraph(graph) };
	});

	const propertyToValue = useActionState((actionState) => {
		const graph = actionState.nodeEditor.graphs[graphId];

		const context: ComputeNodeContext = {
			computed: {},
			compositionId,
			layerId,
			compositionState: actionState.compositionState,
			timelines: actionState.timelines,
			timelineSelection: actionState.timelineSelection,
			graph,
			frameIndex: actionState.compositionState.compositions[compositionId].frameIndex,
		};

		return computePropertyValues(context, graph && actionState.nodeEditor.graphs[graph.id]);
	});

	return (
		<CompTimePropertyValueContext.Provider value={propertyToValue}>
			{props.children}
		</CompTimePropertyValueContext.Provider>
	);
};