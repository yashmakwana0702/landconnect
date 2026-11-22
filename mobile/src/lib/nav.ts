import { router } from 'expo-router';

/** Close a modal screen, falling back to the home tab when there is no history. */
export function closeModal(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
