import { AppRouter } from "../background";
import { createTRPCProxyClient } from "@trpc/client";
import { chromeLink } from "trpc-chrome/link";
import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

const port = browser.runtime.connect();
const trpc = createTRPCProxyClient<AppRouter>({
	links: [chromeLink({ port })],
});

export default function Sidebar({ text }: { text: string }) {
	const [cardData, setCardData] = React.useState<{ front: string; back: string } | null>(null);
	const [editableFront, setEditableFront] = React.useState("");
	const [editableBack, setEditableBack] = React.useState("");
	const [loading, setLoading] = React.useState(false);
	const [deck, setDeck] = React.useState("");
	const [tags, setTags] = React.useState("");
	const [decks, setDecks] = React.useState<string[]>([]);
	const [generateError, setGenerateError] = React.useState("");
	const [adding, setAdding] = React.useState(false);
	const [inputText, setInputText] = React.useState("");
	const [isOpen, setIsOpen] = React.useState(false);
	const [deckFetchError, setDeckFetchError] = React.useState("");
	const [hasApiKey, setHasApiKey] = React.useState<boolean | null>(null);
	const [isInitialLoad, setIsInitialLoad] = React.useState(true);

	// Save deck to storage when it changes
	React.useEffect(() => {
		if (deck && !isInitialLoad) {
			browser.storage.local.set({ lastSelectedDeck: deck });
		}
	}, [deck, isInitialLoad]);

	// Save tags to storage when they change (but not during initial load)
	React.useEffect(() => {
		if (!isInitialLoad) {
			browser.storage.local.set({ lastSelectedTags: tags });
		}
	}, [tags, isInitialLoad]);

	// Load saved values from storage on mount
	React.useEffect(() => {
		const loadSavedValues = async () => {
			try {
				const result = await browser.storage.local.get(["lastSelectedDeck", "lastSelectedTags"]);
				if (result.lastSelectedTags) {
					setTags(result.lastSelectedTags);
				}
				// Note: We'll set the deck after fetching available decks to ensure it's valid
			} catch (error) {
				console.error("Failed to load saved values:", error);
			} finally {
				// Allow saving to storage after initial load is complete
				setIsInitialLoad(false);
			}
		};
		loadSavedValues();
	}, []);

	const toggleSidebar = async () => {
		setIsOpen(!isOpen);
		// Refresh API key check when opening sidebar
		if (!isOpen) {
			try {
				const apiKey = await trpc.getApiKey.query();
				setHasApiKey(!!apiKey);
			} catch (error) {
				console.error("Failed to check API key:", error);
				setHasApiKey(false);
			}
		}
	};

	React.useEffect(() => {
		console.log("Adding listener in component");
		browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
			if (message.type === "startCardGeneration") {
				console.log("Selected text:", message.text);
				setIsOpen(true);
				setInputText(message.text);
				// Refresh API key check
				try {
					const apiKey = await trpc.getApiKey.query();
					setHasApiKey(!!apiKey);
				} catch (error) {
					console.error("Failed to check API key:", error);
					setHasApiKey(false);
				}
				sendResponse({ success: true });
			}
		});

		async function checkApiKey() {
			try {
				const apiKey = await trpc.getApiKey.query();
				setHasApiKey(!!apiKey);
			} catch (error) {
				console.error("Failed to check API key:", error);
				setHasApiKey(false);
			}
		}

		async function fetchDecks() {
			try {
				const decks = await trpc.fetchDecks.query();
				setDecks(decks);

				// Try to restore saved deck, otherwise use first available deck
				try {
					const result = await browser.storage.local.get(["lastSelectedDeck"]);
					const savedDeck = result.lastSelectedDeck;

					if (savedDeck && decks.includes(savedDeck)) {
						setDeck(savedDeck);
					} else {
						setDeck(decks[0] || "");
					}
				} catch (storageError) {
					console.error("Failed to load saved deck:", storageError);
					setDeck(decks[0] || "");
				}

				setDeckFetchError(""); // Clear any previous error
			} catch (error) {
				console.error("Failed to fetch decks:", error);
				setDeckFetchError("Error connecting to Anki. Is Anki running?");
			}
		}

		checkApiKey();
		fetchDecks();
	}, []);

	React.useEffect(() => {
		const handleKeyPress = async (event: any) => {
			if (event.altKey && event.key === "a") {
				event.preventDefault();

				// Check if there's selected text
				const selectedText = window.getSelection()?.toString();

				if (selectedText && selectedText.trim()) {
					console.log("ALT+A pressed with selected text:", `"${selectedText}"`);
					// Open sidebar and set the input text
					setIsOpen(true);
					setInputText(selectedText.trim());
					// Reset any previous card data to start fresh
					setCardData(null);
					setEditableFront("");
					setEditableBack("");
					setGenerateError("");
					// Refresh API key check
					try {
						const apiKey = await trpc.getApiKey.query();
						setHasApiKey(!!apiKey);
					} catch (error) {
						console.error("Failed to check API key:", error);
						setHasApiKey(false);
					}
				} else {
					console.log("ALT+A pressed but no text selected, toggling sidebar");
					// No selected text, just toggle the sidebar
					toggleSidebar();
				}
			}
		};

		document.addEventListener("keydown", handleKeyPress);
		return () => {
			document.removeEventListener("keydown", handleKeyPress);
		};
	}, [isOpen]);

	const generateCard = async () => {
		console.log("Generate card clicked, inputText:", `"${inputText}"`);
		console.log("Input text length:", inputText.length);

		// Improved validation to handle whitespace and empty strings
		if (!inputText || inputText.trim() === "") {
			console.log("Input text is empty or only whitespace, returning early");
			return;
		}

		setLoading(true);
		try {
			const result = await trpc.generateCard.query({ text: inputText.trim() });
			setCardData(result);
			setEditableFront(result.front);
			setEditableBack(result.back);
			setGenerateError("");
		} catch (error) {
			console.error("Failed to generate card:", error);
			setGenerateError("Error generating card! Please contact your boyfriend...");
		} finally {
			setLoading(false);
		}
	};

	const handleAdd = async () => {
		if (!cardData) return;

		setAdding(true);
		try {
			await trpc.addCard.mutate({
				front: editableFront,
				back: editableBack,
				deck,
				tags: tags
					.split(",")
					.map((t) => t.trim())
					.filter((t) => t),
			});
		} catch (error) {
			console.error("Failed to add card:", error);
		} finally {
			setAdding(false);
		}
	};

	return (
		<>
			{/* Sidebar Overlay */}
			<div
				className={`fixed top-4 right-4 w-96 max-h-[calc(100vh-2rem)] bg-slate-950 shadow-2xl rounded-xl z-[9998] transform transition-all duration-300 ease-in-out ${
					isOpen
						? "translate-x-0 opacity-100 pointer-events-auto"
						: "translate-x-full opacity-0 pointer-events-none"
				}`}
			>
				{/* Sidebar Header */}
				<div className="flex items-center justify-between p-4 rounded-t-xl">
					<h3 className="text-lg font-bold">text2anki</h3>
					<button onClick={toggleSidebar} className="hover:cursor-pointer">
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<line x1="18" y1="6" x2="6" y2="18"></line>
							<line x1="6" y1="6" x2="18" y2="18"></line>
						</svg>
					</button>
				</div>

				{/* Sidebar Content */}
				<div className="p-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
					{/* API Key Error Message */}
					{hasApiKey === false && (
						<div className="mb-4 p-3 bg-red-950/50 border border-red-500/50 rounded-lg">
							<div className="flex items-start gap-2">
								<div className="text-red-400 flex-shrink-0 mt-0.5">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
										<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
									</svg>
								</div>
								<div className="text-red-300">
									<div className="font-medium text-sm">API Key Required</div>
									<div className="text-xs mt-1 text-red-200/80">
										Please click the extension icon in your browser's top-right corner to set up
										your Google API key.
									</div>
								</div>
							</div>
						</div>
					)}
					<Label className="block">
						<span className="block text-sm font-medium mb-1">Input Text:</span>
						<Textarea
							value={inputText}
							onChange={(e) => {
								console.log("Input changed, new value:", `"${e.target.value}"`);
								setInputText(e.target.value);
							}}
							placeholder=""
							className="h-24 resize-none"
						/>
					</Label>

					{loading ? (
						<div className="flex flex-row gap-2 mt-2">
							<Loader2 className="animate-spin" /> Generating card...
						</div>
					) : cardData ? (
						<div className="text-green-500">Generated card successfully</div>
					) : generateError ? (
						<div className="text-red-500">Failed to generate card</div>
					) : (
						<></>
					)}
					<div className="my-4">
						<Label className="block">
							<span className="block text-sm font-medium mb-1">Front:</span>
							<Textarea
								value={editableFront}
								onChange={(e) => setEditableFront(e.target.value)}
								placeholder="Front of the card"
								className="h-24 resize-none"
							/>
						</Label>
					</div>
					<div className="my-4">
						<Label className="block">
							<span className="block text-sm font-medium mb-1">Back:</span>
							<Textarea
								value={editableBack}
								onChange={(e) => setEditableBack(e.target.value)}
								placeholder="Back of the card"
								className="h-24 resize-none"
							/>
						</Label>
					</div>

					<div className="space-y-3 mt-4">
						<Label className="block">
							<span className="block text-sm font-medium mb-1">Deck:</span>
							<SimpleSelect
								value={deck}
								onChange={setDeck}
								options={decks}
								placeholder="Select a deck"
								disabled={decks.length === 0}
							/>
						</Label>

						{deckFetchError && <div className="text-red-500 text-sm">{deckFetchError}</div>}

						<Label className="block">
							<span className="block text-sm font-medium mb-1">Tags:</span>
							<Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tag1, tag2" />
						</Label>
					</div>

					<div className="flex gap-2 mt-4">
						<Button
							onClick={() => {
								console.log("Generate button clicked!");
								generateCard();
							}}
							disabled={loading || hasApiKey === false}
							variant="default"
						>
							{loading ? "Generating..." : "Generate"}
						</Button>
						<Button
							onClick={handleAdd}
							disabled={adding || !cardData || !editableFront.trim() || !editableBack.trim()}
							variant="default"
						>
							{adding ? "Adding..." : "Add to Deck"}
						</Button>
					</div>
				</div>
			</div>
		</>
	);
}
