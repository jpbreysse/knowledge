// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AppUser } from '$lib/server/auth';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Signed-in user (or the synthetic api-token principal); null when anonymous. */
			user: AppUser | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
