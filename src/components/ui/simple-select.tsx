import React from "react";

interface SimpleSelectProps {
	value: string;
	onChange: (value: string) => void;
	options: string[];
	placeholder?: string;
	disabled?: boolean;
}

export const SimpleSelect: React.FC<SimpleSelectProps> = ({
	value,
	onChange,
	options,
	placeholder = "Select an option",
	disabled = false,
}) => {
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			disabled={disabled}
			style={{
				width: "100%",
				padding: "0.5rem 1rem",
				borderRadius: "0.375rem",
				border: "1px solid #cbd5e1",
				background: "#1e293b",
				color: "#f1f5f9",
				fontSize: "1rem",
				outline: "none",
				marginTop: "0.25rem",
				marginBottom: "0.25rem",
				cursor: disabled ? "not-allowed" : "pointer",
			}}
			aria-label={placeholder}
		>
			<option value="" disabled>
				{placeholder}
			</option>
			{options.map((opt) => (
				<option key={opt} value={opt}>
					{opt}
				</option>
			))}
		</select>
	);
};
