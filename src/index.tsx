import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";
import "~/globals";
import { addListener } from "~/listener/addListener";
import { isKeyCodeOf, isKeyDown } from "~/listener/keyboard";
import { historyActions } from "~/state/history/historyActions";
import { store } from "~/state/store";
import { App } from "./App";

const Root = () => (
	<Provider store={store}>
		<App />
	</Provider>
);

ReactDOM.render(<Root />, document.getElementById("root"));

// Disable right click context menu
document.addEventListener("contextmenu", (e) => e.preventDefault(), false);

addListener.repeated("keydown", { modifierKeys: ["Command"] }, (e) => {
	if (!isKeyCodeOf("Z", e.keyCode)) {
		return;
	}

	e.preventDefault();

	const state = store.getState();
	if (isKeyDown("Shift")) {
		// Attempted redo
		if (state.flowState.index < state.flowState.list.length - 1) {
			store.dispatch(historyActions.moveHistoryIndex(state.flowState.index + 1));
		}
	} else if (state.flowState.index > 0) {
		store.dispatch(historyActions.moveHistoryIndex(state.flowState.index - 1));
	}
});
