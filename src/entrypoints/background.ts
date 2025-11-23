import { initTRPC } from "@trpc/server";
import { createChromeHandler } from "trpc-chrome/adapter";
import { z } from "zod";
import type { TRPCError } from "@trpc/server";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { apiKeyStorage } from "@/lib/database";

const t = initTRPC.create({
	isServer: false,
	allowOutsideOfServer: true,
});

// Google client will be constructed per-request using a stored API key

const flashcardSchema = z.object({
	front: z.string(),
	back: z.string(),
});

export const appRouter = t.router({
	// Persist API key in IndexedDB using Dexie
	getApiKey: t.procedure.query(async () => {
		try {
			return await apiKeyStorage.getApiKey();
		} catch (error) {
			console.error("Failed to get API key from IndexedDB:", error);
			return null;
		}
	}),
	setApiKey: t.procedure.input(z.object({ apiKey: z.string() })).mutation(async ({ input }) => {
		try {
			await apiKeyStorage.saveApiKey(input.apiKey);
			return { success: true } as const;
		} catch (error) {
			console.error("Failed to save API key to IndexedDB:", error);
			throw new Error("Failed to save API key");
		}
	}),
	fetchDecks: t.procedure.query(async () => {
		try {
			const res = await fetch("http://127.0.0.1:8765", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ action: "deckNames", version: 6 }),
			});

			if (!res.ok) {
				throw new Error(`AnkiConnect request failed with status ${res.status}: ${res.statusText}`);
			}

			const data = await res.json();

			if (data.error) {
				throw new Error(`AnkiConnect error: ${data.error}`);
			}

			return data.result;
		} catch (error) {
			console.error("Failed to fetch decks from AnkiConnect:", error);
			throw new Error("Unable to connect to Anki. Please ensure Anki is running and AnkiConnect addon is installed.");
		}
	}),
	generateCard: t.procedure.input(z.object({ text: z.string() })).query(async ({ input }) => {
		let storedKey: string | null = null;
		try {
			storedKey = await apiKeyStorage.getApiKey();
		} catch (error) {
			console.error("Failed to get API key from IndexedDB:", error);
		}

		const envKey = import.meta.env.WXT_GOOGLE_GENERATIVE_AI_API_KEY as string | undefined;
		const apiKey = storedKey ?? envKey;

		if (!apiKey) {
			throw new Error("Google API key is not set. Please configure it in the extension popup.");
		}

		const google = createGoogleGenerativeAI({ apiKey });

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
			try {
				const res = await fetch("http://127.0.0.1:8765", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
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

				if (!res.ok) {
					throw new Error(`AnkiConnect request failed with status ${res.status}: ${res.statusText}`);
				}

				const data = await res.json();

				if (data.error) {
					throw new Error(`AnkiConnect error: ${data.error}`);
				}

				return { success: true };
			} catch (error) {
				console.error("Failed to add card to AnkiConnect:", error);
				throw new Error("Unable to add card to Anki. Please ensure Anki is running and AnkiConnect addon is installed.");
			}
		}),
});

export type AppRouter = typeof appRouter;

export default defineBackground(() => {
	console.log("Hello background!", { id: browser.runtime.id });

	// Migrate existing API keys from browser.storage.local to IndexedDB
	apiKeyStorage.migrateFromBrowserStorage().catch((error) => {
		console.error("Failed to migrate API key during background script initialization:", error);
	});

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
