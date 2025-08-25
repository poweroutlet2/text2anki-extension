import React from "react";
import "@/entrypoints/global.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTRPCProxyClient } from "@trpc/client";
import { chromeLink } from "trpc-chrome/link";
import type { AppRouter } from "@/entrypoints/background";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoIcon } from "lucide-react";

function App() {
    const port = React.useMemo(() => browser.runtime.connect(), []);
    const trpc = React.useMemo(
        () =>
            createTRPCProxyClient<AppRouter>({
                links: [chromeLink({ port })],
            }),
        [port]
    );

    const [apiKey, setApiKey] = React.useState("");
    const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
    const [error, setError] = React.useState("");

    React.useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const existing = await trpc.getApiKey.query();
                if (mounted && existing) setApiKey(existing);
            } catch (e) {
                // noop
            }
        })();
        return () => {
            mounted = false;
        };
    }, [trpc]);

    const handleSave = async () => {
        if (!apiKey.trim()) return;
        setStatus("saving");
        setError("");
        try {
            await trpc.setApiKey.mutate({ apiKey: apiKey.trim() });
            setStatus("saved");
            setTimeout(() => setStatus("idle"), 1200);
        } catch (e) {
            setStatus("error");
            setError("Failed to save API key");
        }
    };

    return (
        <div className="p-4 w-80 space-y-4">
            <div className="space-y-2">
                <Label htmlFor="google-api-key">Google API Key</Label>
                <Input
                    id="google-api-key"
                    placeholder="AIza..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    type="password"
                />
                <div className="flex items-center gap-2">
                    <Button onClick={handleSave} disabled={status === "saving" || apiKey.trim() === ""}>
                        {status === "saving" ? "Saving..." : "Save"}
                    </Button>
                    {status === "saved" && <span className="text-sm text-green-600">Saved</span>}
                    {status === "error" && <span className="text-sm text-red-600">{error}</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                    <Tooltip>
                        <TooltipTrigger>
                            <div className="flex flex-row gap-1 items-center justify-center">
                                <InfoIcon className="size-3" /> Having issues?
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            <p>Contact your boyfriend!</p>
                        </TooltipContent>
                    </Tooltip>
                </p>
            </div>
        </div>
    );
}

export default App;
