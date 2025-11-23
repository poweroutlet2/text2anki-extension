import Dexie, { type Table } from "dexie";

// Interface for API key storage
interface ApiKeyEntry {
	name: string; // Primary key
	value: string; // The actual API key value
}

// Database class extending Dexie
class ExtensionDatabase extends Dexie {
	// Table for storing API keys
	apiKeys!: Table<ApiKeyEntry>;

	constructor() {
		super("ExtensionDB");

		// Define the database schema
		this.version(1).stores({
			apiKeys: "name,value", // 'name' as primary key
		});
	}
}

// Create a global database instance following Dexie best practices
const db = new ExtensionDatabase();

// Request persistent storage to prevent data loss
if (typeof navigator !== "undefined" && "storage" in navigator && "persist" in navigator.storage) {
	navigator.storage
		.persist()
		.then((persistent) => {
			if (persistent) {
				console.log("Storage will not be cleared except by explicit user action");
			} else {
				console.log("Storage may be cleared by the UA under storage pressure");
			}
		})
		.catch((err) => {
			console.warn("Failed to request persistent storage:", err);
		});
}

// Open the database and handle potential errors
db.open().catch((err) => {
	console.error("Failed to open database:", err);
});

// Cache the open promise to prevent multiple concurrent open attempts
let openPromise: Promise<void> | null = null;

/**
 * Ensure the database is ready before performing operations
 * This prevents race conditions where operations are attempted before the database is fully opened
 */
async function ensureReady(): Promise<void> {
	if (db.isOpen()) {
		return;
	}

	if (!openPromise) {
		openPromise = db.open().catch((err) => {
			console.error("Failed to open database:", err);
			openPromise = null; // Reset on error so we can retry
			throw err;
		});
	}

	await openPromise;
}

// API key management functions
export const apiKeyStorage = {
	/**
	 * Save the API key to IndexedDB
	 * @param apiKey The API key to store
	 */
	async saveApiKey(apiKey: string): Promise<void> {
		try {
			await ensureReady();
			await db.apiKeys.put({ name: "userApiKey", value: apiKey });
			console.log("API key saved successfully to IndexedDB");
		} catch (error) {
			console.error("Failed to save API key to IndexedDB:", error);
			throw new Error(`Failed to save API key: ${error}`);
		}
	},

	/**
	 * Retrieve the API key from IndexedDB
	 * @returns The stored API key or null if not found
	 */
	async getApiKey(): Promise<string | null> {
		try {
			await ensureReady();
			const entry = await db.apiKeys.get("userApiKey");
			if (entry) {
				console.log("Retrieved API key from IndexedDB");
				return entry.value;
			} else {
				console.log("No API key found in IndexedDB");
				return null;
			}
		} catch (error) {
			console.error("Failed to retrieve API key from IndexedDB:", error);
			throw new Error(`Failed to retrieve API key: ${error}`);
		}
	},

	/**
	 * Delete the API key from IndexedDB
	 */
	async deleteApiKey(): Promise<void> {
		try {
			await ensureReady();
			await db.apiKeys.delete("userApiKey");
			console.log("API key deleted successfully from IndexedDB");
		} catch (error) {
			console.error("Failed to delete API key from IndexedDB:", error);
			throw new Error(`Failed to delete API key: ${error}`);
		}
	},

	/**
	 * Check if an API key exists in storage
	 * @returns True if an API key exists, false otherwise
	 */
	async hasApiKey(): Promise<boolean> {
		try {
			await ensureReady();
			const entry = await db.apiKeys.get("userApiKey");
			return !!entry;
		} catch (error) {
			console.error("Failed to check API key existence:", error);
			return false;
		}
	},

	/**
	 * Migrate API key from browser.storage.local to IndexedDB
	 * This is useful for existing users who have API keys stored in the old format
	 */
	async migrateFromBrowserStorage(): Promise<boolean> {
		try {
			await ensureReady();
			// Check if we already have an API key in IndexedDB
			const hasExistingKey = await this.hasApiKey();
			if (hasExistingKey) {
				console.log("API key already exists in IndexedDB, skipping migration");
				return false;
			}

			// Try to get API key from browser.storage.local
			if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
				const result = await browser.storage.local.get("googleApiKey");
				const oldApiKey = result?.googleApiKey as string | undefined;

				if (oldApiKey) {
					console.log("Migrating API key from browser.storage.local to IndexedDB");
					await this.saveApiKey(oldApiKey);

					// Optionally remove from old storage
					await browser.storage.local.remove("googleApiKey");
					console.log("Migration completed successfully");
					return true;
				}
			}

			console.log("No API key found in browser.storage.local to migrate");
			return false;
		} catch (error) {
			console.error("Failed to migrate API key:", error);
			return false;
		}
	},
};

// Export the database instance for advanced usage if needed
export { db };
