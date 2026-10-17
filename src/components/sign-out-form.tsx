"use client";

export function SignOutForm() {
  return (
    <form action="/api/auth/logout" method="post" onSubmit={(event) => {
      if (!window.confirm("Sign out of Spandan on this device?")) event.preventDefault();
    }}>
      <button type="submit" className="signout-btn">Sign out</button>
    </form>
  );
}
