// Relay requires globally unique IDs encoded as base64("TypeName:localId")

export function toGlobalId(type: string, id: string | number): string {
  return Buffer.from(`${type}:${id}`).toString("base64");
}

export function fromGlobalId(globalId: string): { type: string; id: string } {
  const decoded = Buffer.from(globalId, "base64").toString("utf8");
  const colonIndex = decoded.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(`Invalid global ID: "${globalId}" — decoded value has no type separator`);
  }
  const type = decoded.slice(0, colonIndex);
  const id = decoded.slice(colonIndex + 1);
  if (!type || !id) {
    throw new Error(`Invalid global ID: "${globalId}" — type or id is empty`);
  }
  return { type, id };
}
