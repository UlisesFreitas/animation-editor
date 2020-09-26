import React from "react";
import { NumberInput } from "~/components/common/NumberInput";
import { NODE_H_PADDING_BASE } from "~/constants";
import { compileStylesheetLabelled } from "~/util/stylesheets";

const s = compileStylesheetLabelled(({ css }) => ({
	container: css`
		height: 20px;
		padding: 2px 0;

		&--horizontalPadding {
			padding-left: ${NODE_H_PADDING_BASE};
			padding-right: ${NODE_H_PADDING_BASE};
		}

		&--paddingLeft {
			padding-left: ${NODE_H_PADDING_BASE};
		}

		&--paddingRight {
			padding-right: ${NODE_H_PADDING_BASE};
		}
	`,
}));

interface Props {
	label: string;
	value: number;
	onChange: (value: number) => void;
	onChangeEnd: ((type: "relative" | "absolute") => void) | undefined;
	min?: number;
	max?: number;
	tick?: number;
	decimalPlaces?: number;
	horizontalPadding?: boolean;
	paddingRight?: boolean;
	paddingLeft?: boolean;
}

export const NodeEditorNumberInput: React.FC<Props> = (props) => {
	const {
		horizontalPadding = false,
		paddingLeft = false,
		paddingRight = false,
		decimalPlaces,
		tick,
		min,
		max,
	} = props;

	return (
		<div className={s("container", { horizontalPadding, paddingLeft, paddingRight })}>
			<NumberInput
				label={props.label}
				value={props.value}
				onChange={props.onChange}
				onChangeEnd={props.onChangeEnd}
				max={max}
				min={min}
				tick={tick}
				decimalPlaces={decimalPlaces}
				fillWidth
				fullWidth
				nodeEditor
			/>
		</div>
	);
};
