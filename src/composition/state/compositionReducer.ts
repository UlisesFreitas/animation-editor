import { ActionType, createAction, getType } from "typesafe-actions";
import {
	Composition,
	CompositionLayer,
	CompositionLayerProperty,
} from "~/composition/compositionTypes";

export interface CompositionState {
	compositions: {
		[compositionId: string]: Composition;
	};
	layers: {
		[layerId: string]: CompositionLayer;
	};
	properties: {
		[propertyId: string]: CompositionLayerProperty;
	};
}

export const initialCompositionState: CompositionState = {
	compositions: {
		"0": {
			id: "0",
			layers: ["0"],
			frameIndex: 0,
			length: 500,
			width: 400,
			height: 400,
		},
	},
	layers: {
		"0": {
			id: "0",
			name: "Rect",
			index: 10,
			length: 50,
			properties: ["0", "1"],
		},
	},
	properties: {
		"0": {
			timelineId: "0",
			name: "X Position",
			type: "number",
			value: 100,
		},
		"1": {
			timelineId: "",
			name: "Y Position",
			type: "number",
			value: 50,
		},
	},
};

export const compositionActions = {
	togglePropertySelection: createAction("compTimeline/TOGGLE_PROPERTY_SELECTED", (action) => {
		return (compositionId: string, propertyId: string) => action({ compositionId, propertyId });
	}),

	clearPropertySelection: createAction("compTimeline/CLEAR_PROPERTY_SELECTED", (action) => {
		return (compositionId: string) => action({ compositionId });
	}),

	setFrameIndex: createAction("compTimeline/SET_FRAME_INDEX", (action) => {
		return (compositionId: string, frameIndex: number) => action({ compositionId, frameIndex });
	}),
};

type Action = ActionType<typeof compositionActions>;

export const compositionReducer = (
	state = initialCompositionState,
	action: Action,
): CompositionState => {
	switch (action.type) {
		case getType(compositionActions.setFrameIndex): {
			const { compositionId, frameIndex } = action.payload;
			return {
				...state,
				compositions: {
					...state.compositions,
					[compositionId]: {
						...state.compositions[compositionId],
						frameIndex,
					},
				},
			};
		}

		default:
			return state;
	}
};
