import { initTRPC } from "@trpc/server";
import { createChromeHandler } from "trpc-chrome/adapter";
import { z } from "zod";
import type { TRPCError } from "@trpc/server";
import { generateObject, generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const t = initTRPC.create({
	isServer: false,
	allowOutsideOfServer: true,
});

const google = createGoogleGenerativeAI({
	apiKey: import.meta.env.WXT_GOOGLE_GENERATIVE_AI_API_KEY,
});

const flashcardSchema = z.object({
	front: z.string(),
	back: z.string(),
});

export const appRouter = t.router({
	fetchDecks: t.procedure.query(async () => {
		const res = await fetch("http://127.0.0.1:8765", {
			method: "POST",
			body: JSON.stringify({ action: "deckNames", version: 6 }),
		});
		const { result } = await res.json();

		return result;
	}),
	generateCard: t.procedure.input(z.object({ text: z.string() })).query(async ({ input }) => {
		const { object } = await generateObject({
			model: google("gemini-2.5-flash"),
			schema: flashcardSchema,
			prompt: `
			Create an Anki flashcard with a front and back:
			Text: """${input.text}"""
		`,
		});

		console.log(object);
		return object;
	}),
	addCard: t.procedure
		.input(
			z.object({
				front: z.string(),
				back: z.string(),
				deck: z.string(),
				tags: z.array(z.string()),
			})
		)
		.mutation(async ({ input }) => {
			await fetch("http://127.0.0.1:8765", {
				method: "POST",
				body: JSON.stringify({
					action: "addNote",
					version: 6,
					params: {
						note: {
							deckName: input.deck,
							modelName: "Basic",
							fields: { Front: input.front, Back: input.back },
							tags: input.tags,
						},
					},
				}),
			});
			return { success: true };
		}),
});

export type AppRouter = typeof appRouter;

export default defineBackground(() => {
	console.log("Hello background!", { id: browser.runtime.id });

	createChromeHandler({
		router: appRouter,
		createContext: () => ({}),
		onError: (opts: { error: TRPCError }) => {
			console.error("Error:", opts.error);
		},
	});

	browser.contextMenus.create({
		id: "create-anki-card",
		title: "Create Anki Card",
		contexts: ["selection"],
	});

	browser.contextMenus.onClicked.addListener(async ({ selectionText }) => {
		if (selectionText) {
			console.log(selectionText);
			// Content will call tRPC directly
			browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
				console.log(tabs[0].url);
				browser.tabs.sendMessage(tabs[0].id!, { type: "startCardGeneration", text: selectionText });
			});
		}
	});
});
