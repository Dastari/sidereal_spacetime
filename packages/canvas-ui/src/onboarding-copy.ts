export function onboardingCopy(accountKind?: "oidc" | "development") {
  return {
    title: "Enter the universe",
    description:
      accountKind === "development"
        ? "Create a persistent development character and ship in the shared system."
        : "Create your persistent character and ship in the shared system.",
    action: "Enter universe",
    identity:
      accountKind === "oidc"
        ? "Saved to your Dastari account. Your character and belongings stay with you."
        : accountKind === "development"
          ? "Development identity on this browser. It is separate from a Dastari account."
          : "Your character and belongings are saved to the connected identity.",
  };
}
