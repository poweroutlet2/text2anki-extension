import "../global.css";
import ReactDOM from "react-dom/client";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sidebar from "./App.tsx";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 5, // 5 minutes
			retry: 1,
		},
	},
});

export default defineContentScript({
	matches: ["*://*/*"],
	cssInjectionMode: "ui",

	async main(ctx) {
		console.log("Content script main function running");

		const ui = await createShadowRootUi(ctx, {
			name: "wxt-react-example",
			position: "inline",
			anchor: "body",
			append: "first",
			onMount: (container) => {
				console.log("Content script onMount called");
				// Don't mount react app directly on <body>
				const wrapper = document.createElement("div");
				container.append(wrapper);

				const root = ReactDOM.createRoot(wrapper);
				root.render(
					<React.StrictMode>
						<QueryClientProvider client={queryClient}>
							<Sidebar text="Hello" />
						</QueryClientProvider>
					</React.StrictMode>
				);
				return { root, wrapper };
			},
			onRemove: (elements) => {
				console.log("Content script onRemove called");
				elements?.root.unmount();
				elements?.wrapper.remove();
			},
		});

		ui.mount();
		console.log("Content script UI mounted");
	},
});
