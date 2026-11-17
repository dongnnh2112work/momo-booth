export async function registerNode() {
  const { assertLocalStaffKey } = await import("./lib/staffKey");
  try {
    assertLocalStaffKey();
  } catch {
    process.exit(1);
  }
}
