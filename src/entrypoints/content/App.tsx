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

	const toggleSidebar = () => {
		setIsOpen(!isOpen);
	};

	React.useEffect(() => {
		console.log("Adding listener in component");
		browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
			if (message.type === "startCardGeneration") {
				console.log("Selected text:", message.text);
				setIsOpen(true);
				setInputText(message.text);
				sendResponse({ success: true });
			}
		});

		async function fetchDecks() {
			try {
				const decks = await trpc.fetchDecks.query();
				setDecks(decks);
				setDeck(decks[0] || "");
			} catch (error) {
				console.error("Failed to fetch decks:", error);
			}
		}
		fetchDecks();
	}, []);

	React.useEffect(() => {
		const handleKeyPress = (event: any) => {
			if (event.altKey && event.key === "a") {
				event.preventDefault();
				toggleSidebar();
			}
		};

		document.addEventListener("keydown", handleKeyPress);
		return () => {
			document.removeEventListener("keydown", handleKeyPress);
		};
	}, [isOpen]);

	const generateCard = async () => {
		if (inputText == "") return;

		setLoading(true);
		try {
			const result = await trpc.generateCard.query({ text: inputText });
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
					<Label className="block">
						<span className="block text-sm font-medium mb-1">Input Text:</span>
						<Input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="" />
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

						<Label className="block">
							<span className="block text-sm font-medium mb-1">Tags:</span>
							<Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tag1, tag2" />
						</Label>
					</div>

					<div className="flex gap-2 mt-4">
						<Button onClick={generateCard} disabled={loading} variant="default">
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
