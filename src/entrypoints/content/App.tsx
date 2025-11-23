import { AppRouter } from "../background";
import { createTRPCProxyClient } from "@trpc/client";
import { chromeLink } from "trpc-chrome/link";
import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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

	const [editableFront, setEditableFront] = React.useState("");
	const [editableBack, setEditableBack] = React.useState("");
	const [deck, setDeck] = React.useState("");
	const [tags, setTags] = React.useState("");
	const [inputText, setInputText] = React.useState("");
	const [isOpen, setIsOpen] = React.useState(false);
	const [isInitialLoad, setIsInitialLoad] = React.useState(true);
	const [showCombo, setShowCombo] = React.useState(false);

	// API Key Query
	const { data: apiKey, refetch: refetchApiKey } = useQuery({
		queryKey: ["apiKey"],
		queryFn: async () => {
			return await trpc.getApiKey.query();
		},
		enabled: isOpen, // Only fetch when sidebar is open
	});
	const hasApiKey = apiKey !== null && apiKey !== undefined;

	// Decks Query
	const {
		data: decks = [],
		error: decksError,
	} = useQuery({
		queryKey: ["decks"],
		queryFn: async () => {
			return await trpc.fetchDecks.query();
		},
		retry: 1,
	});

	const deckFetchError = decksError
		? "Error connecting to Anki. Please ensure Anki is running and the AnkiConnect addon is installed."
		: "";

	// Auto-select deck after decks are loaded
	React.useEffect(() => {
		if (decks.length > 0 && !deck) {
			// Try to restore saved deck, otherwise use first available deck
			browser.storage.local
				.get(["lastSelectedDeck"])
				.then((result) => {
					const savedDeck = result.lastSelectedDeck;
					if (savedDeck && decks.includes(savedDeck)) {
						setDeck(savedDeck);
					} else {
						setDeck(decks[0] || "");
					}
				})
				.catch((storageError) => {
					console.error("Failed to load saved deck:", storageError);
					setDeck(decks[0] || "");
				});
		}
	}, [decks, deck]);

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

	// Generate Card Mutation
	const generateCardMutation = useMutation({
		mutationFn: async (text: string) => {
			return await trpc.generateCard.query({ text: text.trim() });
		},
		onSuccess: (result) => {
			setEditableFront(result.front);
			setEditableBack(result.back);
		},
	});

	// Add Card Mutation
	const addCardMutation = useMutation({
		mutationFn: async (data: { front: string; back: string; deck: string; tags: string[] }) => {
			return await trpc.addCard.mutate(data);
		},
		onSuccess: () => {
			// Success! Clear the form and show success message
			setEditableFront("");
			setEditableBack("");
			setInputText("");
			setShowCombo(true);
			setTimeout(() => setShowCombo(false), 2000); // Hide after 2 seconds
			// Clear success message after 3 seconds
			setTimeout(() => {
				addCardMutation.reset();
			}, 3000);
		},
	});


	// Reusable check: can we add the card to deck?
	const canAddCard = React.useMemo(() => {
		return (
			isOpen &&
			editableFront.trim() !== "" &&
			editableBack.trim() !== "" &&
			deck.trim() !== "" &&
			!addCardMutation.isPending
		);
	}, [isOpen, editableFront, editableBack, deck, addCardMutation.isPending]);

	const toggleSidebar = () => {
		setIsOpen(!isOpen);
		// Refetch API key when opening sidebar
		if (!isOpen) {
			refetchApiKey();
		}
	};

	React.useEffect(() => {
		console.log("Adding listener in component");
		browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
			if (message.type === "startCardGeneration") {
				console.log("Selected text:", message.text);
				setIsOpen(true);
				setInputText(message.text);
				// Refetch API key check
				refetchApiKey();
				sendResponse({ success: true });
			}
		});
	}, [refetchApiKey]);

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
					setEditableFront("");
					setEditableBack("");
					generateCardMutation.reset();
					// Refresh API key check
					refetchApiKey();
				} else {
					console.log("ALT+X pressed but no text selected, toggling sidebar");
					// No selected text, just toggle the sidebar
					toggleSidebar();
				}
			}

			// Alt+Shift+G to generate card or add to deck (context-aware)
			if (event.altKey && event.shiftKey && event.key === "G") {
				event.preventDefault();

				const selectedText = window.getSelection()?.toString();

				// Priority 1: If there's an error adding the card AND there's selected text, regenerate with selected text
				if (addCardMutation.isError && selectedText && selectedText.trim()) {
					console.log("Alt+Shift+G pressed with error state and selected text - regenerating:", `"${selectedText}"`);
					setIsOpen(true);
					setInputText(selectedText.trim());
					setEditableFront("");
					setEditableBack("");
					addCardMutation.reset();
					generateCardMutation.reset();
					generateCardMutation.mutate(selectedText.trim());
				}
				// Priority 2: If highlighted text is different from input text, generate from highlighted text
				else if (selectedText && selectedText.trim() && selectedText.trim() !== inputText.trim()) {
					console.log("Alt+Shift+G pressed with different selected text - generating:", `"${selectedText}"`);
					setIsOpen(true);
					setInputText(selectedText.trim());
					setEditableFront("");
					setEditableBack("");
					addCardMutation.reset();
					generateCardMutation.reset();
					generateCardMutation.mutate(selectedText.trim());
				}
				// Priority 3: If card is ready to add (has front/back content) and no error, add it
				else if (isOpen && editableFront.trim() && editableBack.trim() && deck.trim() && !addCardMutation.isPending && !addCardMutation.isError) {
					console.log("Alt+Shift+G - CONDITIONS MET, adding card");
					addCardMutation.mutate({
						front: editableFront,
						back: editableBack,
						deck,
						tags: tags
							.split(",")
							.map((t) => t.trim())
							.filter((t) => t),
					});
				}
				// Priority 4: If there's selected text, generate from it
				else if (selectedText && selectedText.trim()) {
					console.log("Alt+Shift+G pressed with selected text:", `"${selectedText}"`);
					// Open sidebar if not already open, populate input, and generate
					setIsOpen(true);
					setInputText(selectedText.trim());
					// Clear any previous card data to start fresh
					setEditableFront("");
					setEditableBack("");
					generateCardMutation.reset();
					// Generate immediately with the selected text
					generateCardMutation.mutate(selectedText.trim());
				}
				// Priority 5: Generate with existing input
				else if (isOpen && inputText.trim() && !generateCardMutation.isPending) {
					console.log("Alt+Shift+G pressed - generating card with existing input");
					generateCardMutation.mutate(inputText.trim());
				} else {
					console.log("Alt+Shift+G pressed but no valid conditions met");
				}
			}

			// Alt+Shift++ to add card to deck (only when sidebar is open and has card data)
			if (event.altKey && event.shiftKey && event.key === "=") {
				// Check conditions directly to avoid stale closure issues
				if (isOpen && editableFront.trim() && editableBack.trim() && deck.trim() && !addCardMutation.isPending) {
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
	}, [isOpen, editableFront, editableBack, deck, tags, addCardMutation.isPending, addCardMutation.isError, addCardMutation, inputText, generateCardMutation.isPending, generateCardMutation, refetchApiKey]);

	const generateCard = () => {
		const textToUse = inputText;
		console.log("Generate card clicked, textToUse:", `"${textToUse}"`);
		console.log("Text length:", textToUse.length);

		// Improved validation to handle whitespace and empty strings
		if (!textToUse || textToUse.trim() === "") {
			console.log("Input text is empty or only whitespace, returning early");
			return;
		}

		generateCardMutation.mutate(textToUse.trim());
	};

	const handleAdd = () => {
		addCardMutation.mutate({
			front: editableFront,
			back: editableBack,
			deck,
			tags: tags
				.split(",")
				.map((t) => t.trim())
				.filter((t) => t),
		});
	};

	return (
		<>
			{/* Sidebar Overlay */}
			<div
				className={`fixed top-4 right-4 w-[28rem] max-h-[calc(100vh-2rem)] bg-slate-950 shadow-2xl rounded-xl z-[9998] transform transition-all duration-150 ease-in-out flex flex-col ${isOpen
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
				<div className="p-4 flex-1 min-h-0 overflow-y-auto">
					{/* API Key Error Message */}
					{!hasApiKey && (
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

					{generateCardMutation.isPending ? (
						<div className="flex flex-row gap-2 mt-2">
							<Loader2 className="animate-spin" /> Generating card...
						</div>
					) : generateCardMutation.isSuccess ? (
						<div className="text-green-500">Generated card successfully</div>
					) : generateCardMutation.isError ? (
						<div className="text-red-500">Error generating card! Please contact your boyfriend...</div>
					) : (
						<></>
					)}
					<div className="my-4">
						<Label className="block">
							<span className="block text-sm font-medium mb-1">Front:</span>
							<Textarea
								value={editableFront}
								onChange={(e) => {
									setEditableFront(e.target.value);
									// Reset mutation error when user edits, allowing retry
									if (addCardMutation.isError) {
										addCardMutation.reset();
									}
								}}
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
								onChange={(e) => {
									setEditableBack(e.target.value);
									// Reset mutation error when user edits, allowing retry
									if (addCardMutation.isError) {
										addCardMutation.reset();
									}
								}}
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

					<div className="flex gap-2 mt-4 justify-center">
						<Button
							onClick={() => {
								console.log("Generate button clicked!");
								generateCard();
							}}
							disabled={generateCardMutation.isPending || !hasApiKey}
							variant="default"
							title="Generate card or add to deck (Alt+Shift+G)"
						>
							{generateCardMutation.isPending ? "Generating..." : "Generate"}
							{!generateCardMutation.isPending && <span className="ml-1 text-[10px] opacity-60">(Alt+Shift+G)</span>}
						</Button>
						<Button
							onClick={handleAdd}
							disabled={!canAddCard}
							variant="default"
							title={canAddCard ? "Add card to deck (Alt+Shift+G)" : "Add card to deck (Alt+Shift++)"}
						>
							{addCardMutation.isPending ? "Adding..." : "Add to Deck"}
							{!addCardMutation.isPending && (
								<span
									className={`ml-1 text-[10px] ${canAddCard
										? "opacity-100 font-semibold text-cyan-300 drop-shadow-[0_0_4px_rgba(103,232,249,0.6)] animate-pulse"
										: "opacity-60"
										}`}
								>
									({canAddCard ? "Alt+Shift+G" : "Alt+Shift++"})
								</span>
							)}
						</Button>
					</div>

					<div className={`mt-4 overflow-hidden transition-all duration-500 ease-in-out ${addCardMutation.isSuccess ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
						}`}>
						<div className="p-3 bg-green-950/50 border border-green-500/50 rounded-lg">
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
					</div>

					{/* Error Message */}
					{addCardMutation.isError && (
						<div className="mt-4 p-3 bg-red-950/50 border border-red-500/50 rounded-lg">
							<div className="flex items-start gap-2">
								<div className="text-red-400 flex-shrink-0 mt-0.5">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
										<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
									</svg>
								</div>
								<div className="flex-1 text-red-300">
									<div className="font-medium text-sm">Failed to add card</div>
									<div className="text-xs mt-1 text-red-200/80 space-y-1">
										{(() => {
											const errorMessage = addCardMutation.error instanceof Error
												? addCardMutation.error.message
												: "Unable to add card to Anki.";
											const isDuplicate = errorMessage.toLowerCase().includes("duplicate") ||
												errorMessage.toLowerCase().includes("already exists");

											return (
												<>
													<div>{errorMessage}</div>
													{isDuplicate && (
														<div className="mt-2 pt-2 border-t border-red-500/30">
															<div className="font-medium mb-1">Why this happens:</div>
															<div>Anki uses the Front field as a unique identifier. A card with the same Front text already exists in this deck, even if the Back is different.</div>
															<div className="font-medium mt-2 mb-1">How to fix:</div>
															<div>Edit the Front text to make it unique, then try adding again. The error will clear automatically when you start editing.</div>
														</div>
													)}
												</>
											);
										})()}
									</div>
								</div>
								<button
									onClick={() => addCardMutation.reset()}
									className="text-red-400 hover:text-red-300 flex-shrink-0 ml-2 transition-colors"
									aria-label="Dismiss error"
									title="Dismiss error"
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<line x1="18" y1="6" x2="6" y2="18"></line>
										<line x1="6" y1="6" x2="18" y2="18"></line>
									</svg>
								</button>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Combo Popup */}
			{showCombo && (
				<div
					className="fixed top-[25vh] right-[-8vh] z-[9999] pointer-events-none"
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
