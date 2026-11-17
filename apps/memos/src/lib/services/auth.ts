export function signIn(next: string) {
  window.location.href = `/auth/sign-in?next=${encodeURIComponent(next)}`;
}

export async function signOut() {
  await fetch("/auth/sign-out", { method: "POST" });
  window.location.href = "/";
}
