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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const port = browser.runtime.connect();
const trpc = createTRPCProxyClient<AppRouter>({
	links: [chromeLink({ port })],
});

export default function Sidebar({ text }: { text: string }) {
	console.log("Sidebar component rendered");

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
	const [addSuccess, setAddSuccess] = React.useState(false);
	const [showCombo, setShowCombo] = React.useState(false);

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

	// Reusable check: can we add the card to deck?
	const canAddCard = React.useMemo(() => {
		return (
			isOpen &&
			!!cardData &&
			editableFront.trim() !== "" &&
			editableBack.trim() !== "" &&
			!adding
		);
	}, [isOpen, cardData, editableFront, editableBack, adding]);

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
				setDeckFetchError("Error connecting to Anki. Please ensure Anki is running and the AnkiConnect addon is installed.");
			}
		}

		checkApiKey();
		fetchDecks();
	}, []);

	React.useEffect(() => {
		console.log("Keyboard event listener effect running, isOpen:", isOpen);

		const handleKeyPress = async (event: any) => {
			// Debug: log all key events
			console.log("Key pressed:", event.key, "Alt:", event.altKey, "Shift:", event.shiftKey, "Ctrl:", event.ctrlKey);

			// Alt+X to toggle sidebar
			if (event.altKey && event.key === "x") {
				event.preventDefault();

				// Check if there's selected text
				const selectedText = window.getSelection()?.toString();

				if (selectedText && selectedText.trim()) {
					console.log("ALT+X pressed with selected text:", `"${selectedText}"`);
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
					console.log("ALT+X pressed but no text selected, toggling sidebar");
					// No selected text, just toggle the sidebar
					toggleSidebar();
				}
			}

			// Alt+Shift+G to generate card or add to deck (context-aware)
			if (event.altKey && event.shiftKey && event.key === "G") {
				event.preventDefault();

				// Priority 1: If card is ready to add (has front/back content), add it
				// Check conditions directly to avoid stale closure issues
				console.log("Alt+Shift+G pressed - checking conditions:");
				console.log("- isOpen:", isOpen);
				console.log("- cardData:", !!cardData);
				console.log("- editableFront:", `"${editableFront}"`);
				console.log("- editableBack:", `"${editableBack}"`);
				console.log("- !adding:", !adding);
				console.log("- canAddCard computed:", isOpen && cardData && editableFront.trim() && editableBack.trim() && !adding);

				if (isOpen && cardData && editableFront.trim() && editableBack.trim() && !adding) {
					console.log("Alt+Shift+G - CONDITIONS MET, calling handleAdd");
					// Show combo popup
					setShowCombo(true);
					setTimeout(() => setShowCombo(false), 2000); // Hide after 2 seconds
					handleAdd();
				}
				// Priority 2: If there's selected text, generate from it
				else {
					const selectedText = window.getSelection()?.toString();

					if (selectedText && selectedText.trim()) {
						console.log("Alt+Shift+G pressed with selected text:", `"${selectedText}"`);
						// Open sidebar if not already open, populate input, and generate
						setIsOpen(true);
						setInputText(selectedText.trim());
						// Clear any previous card data to start fresh
						setCardData(null);
						setEditableFront("");
						setEditableBack("");
						setGenerateError("");
						// Generate immediately with the selected text
						generateCard(selectedText.trim());
					}
					// Priority 3: Generate with existing input
					else if (isOpen && inputText.trim() && !loading) {
						console.log("Alt+Shift+G pressed - generating card with existing input");
						generateCard();
					} else {
						console.log("Alt+Shift+G pressed but no valid conditions met");
					}
				}
			}

			// Alt+Shift++ to add card to deck (only when sidebar is open and has card data)
			if (event.altKey && event.shiftKey && event.key === "=") {
				// Check conditions directly to avoid stale closure issues
				if (isOpen && cardData && editableFront.trim() && editableBack.trim() && !adding) {
					event.preventDefault();
					console.log("Alt+Shift++ pressed - adding card to deck");
					handleAdd();
				}
			}
		};

		window.addEventListener("keydown", handleKeyPress);
		console.log("Keyboard event listener attached to window");

		return () => {
			window.removeEventListener("keydown", handleKeyPress);
			console.log("Keyboard event listener removed from window");
		};
	}, [isOpen, cardData, editableFront, editableBack, adding, inputText, loading]);

	const generateCard = async (textOverride?: string) => {
		const textToUse = textOverride || inputText;
		console.log("Generate card clicked, textToUse:", `"${textToUse}"`);
		console.log("Text length:", textToUse.length);

		// Improved validation to handle whitespace and empty strings
		if (!textToUse || textToUse.trim() === "") {
			console.log("Input text is empty or only whitespace, returning early");
			return;
		}

		setLoading(true);
		try {
			const result = await trpc.generateCard.query({ text: textToUse.trim() });
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
		setAddSuccess(false);
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

			// Success! Clear the form and show success message
			setCardData(null);
			setEditableFront("");
			setEditableBack("");
			setInputText("");
			setAddSuccess(true);

			// Clear success message after 3 seconds
			setTimeout(() => setAddSuccess(false), 3000);
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
				className={`fixed top-4 right-4 w-[28rem] max-h-[75vh] bg-slate-950 shadow-2xl rounded-xl z-[9998] transform transition-all duration-300 ease-in-out ${isOpen
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

						{deckFetchError && (
							<div className="text-red-500 text-sm">
								{deckFetchError}{" "}
								<Tooltip>
									<TooltipTrigger asChild>
										<a
											href="https://ankiweb.net/shared/info/2055492159"
											target="_blank"
											rel="noopener noreferrer"
											className="text-blue-400 underline hover:text-blue-300"
										>
											Install AnkiConnect
										</a>
									</TooltipTrigger>
									<TooltipContent side="bottom" className="max-w-xs">
										<div className="text-xs">
											<p className="font-medium mb-1">How to install AnkiConnect:</p>
											<ol className="list-decimal list-inside space-y-1">
												<li>Open Anki</li>
												<li>Go to Tools → Add-ons → Get Add-ons...</li>
												<li>Enter code: <code className="bg-gray-700 px-1 rounded">2055492159</code></li>
												<li>Click OK to install</li>
												<li>Restart Anki</li>
											</ol>
											<p className="mt-2 text-gray-300">
												AnkiConnect enables browser extensions to communicate with Anki.
											</p>
										</div>
									</TooltipContent>
								</Tooltip>
							</div>
						)}

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
							title="Generate card or add to deck (Alt+Shift+G)"
						>
							{loading ? "Generating..." : "Generate"}
							{!loading && <span className="ml-1 text-[10px] opacity-60">(Alt+Shift+G)</span>}
						</Button>
						<Button
							onClick={handleAdd}
							disabled={!canAddCard}
							variant="default"
							title="Add card to deck (Alt+Shift++)"
						>
							{adding ? "Adding..." : "Add to Deck"}
							{!adding && <span className="ml-1 text-[10px] opacity-60">(Alt+Shift++)</span>}
						</Button>
					</div>

					{addSuccess && (
						<div className="mt-4 p-3 bg-green-950/50 border border-green-500/50 rounded-lg">
							<div className="flex items-center gap-2">
								<div className="text-green-400">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
										<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
									</svg>
								</div>
								<div className="text-green-300 text-sm font-medium">
									Card successfully added to Anki!
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Combo Popup */}
			{showCombo && (
				<div
					className="fixed top-[25vh] right-[calc(1rem+0rem)] z-[9999] pointer-events-none"
					style={{
						animation: "comboPopSidebar 0.6s ease-out forwards",
					}}
				>
					<div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-4xl font-bold px-8 py-4 rounded-xl shadow-2xl border-2 border-white/20">
						COMBO MOVE!!
					</div>
				</div>
			)}
		</>
	);
}
