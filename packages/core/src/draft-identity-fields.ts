// Canonical draft identity fields, shared by native and browser hash adapters.
import type { PublishRequest } from "@publy/shared";
export function visitDraftIdentityFields(request: Omit<PublishRequest, "idempotencyKey">, field: (value: string) => void): void {
  field("publy-wechat-draft-v2");
  field(request.account);
  field(request.type);
  field(request.title);
  field(request.html ?? "");
  field(request.cover ?? "");
  field(request.coverMode ?? "");
  field(request.author ?? "");
  field(request.digest ?? "");
  field(request.contentSourceUrl ?? "");
  field(request.needOpenComment === undefined ? "unset" : String(request.needOpenComment));
  field(request.onlyFansCanComment === undefined ? "unset" : String(request.onlyFansCanComment));
  field(request.publishAt ?? "");
  const attachments = request.images ?? [];
  field(String(attachments.length));
  for (const image of attachments) {
    field(image.name);
    field(image.contentType ?? "");
    field(image.data);
  }
}
