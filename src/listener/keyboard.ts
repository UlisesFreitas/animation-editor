import { keys } from "~/constants";

type Key = keyof typeof keys;

export const keyCodes = (Object.keys(keys) as Array<keyof typeof keys>).reduce<{
	[keyCode: number]: keyof typeof keys;
}>((obj, key) => {
	obj[keys[key]] = key;
	return obj;
}, {});

let keyPressMap: { [key in Key]: boolean } = {} as any;

window.addEventListener("keydown", (e: KeyboardEvent) => {
	keyPressMap[e.keyCode.toString() as Key] = true;
});
window.addEventListener("keyup", (e: KeyboardEvent) => {
	const key = keyCodes[e.keyCode];
	if (key === "Command" || key === "Alt" || key === "Control") {
		keyPressMap = {} as any;
	} else {
		keyPressMap[e.keyCode.toString() as Key] = false;
	}
});

export const isKeyDown = (key: Key) => {
	return !!keyPressMap[keys[key].toString() as Key];
};

export const isKeyCodeOf = (key: Key, keyCode: number) => keys[key] === keyCode;
