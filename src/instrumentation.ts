export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { assertLocalStaffKey } = await import("./lib/staffKey");
  try {
    assertLocalStaffKey();
  } catch {
    process.exit(1);
  }
  try {
    const { startDisplayIngest } = await import("./lib/displayIngest");
    await startDisplayIngest();
  } catch {
    console.error("display ingest failed");
  }
}
