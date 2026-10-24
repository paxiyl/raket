import { ImageIcon, UploadIcon } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useImagePresets } from "@/features/presets/use-image-presets";
import { useUploadImage } from "@/features/uploads/use-upload-image";
import { apiMessage } from "@/lib/axios-client";

type Props = {
  label: string;
  /** The hosted URL, or "" for no image. */
  value: string;
  /** The Cloudinary folder this upload lands in. Authorised server-side. */
  folder: string;
  onChange: (imageUrl: string) => void;
  /** Preview shape: a logo is square, a cover is wide. */
  shape?: "square" | "wide";
  description?: string;
  /** For the label's `htmlFor` and the URL box. */
  id: string;
};

const SHAPES = { square: "size-24", wide: "h-24 w-40" } as const;

/**
 * Picking a hosted image for a record that has no preset-tile fallback.
 *
 * `ImagePicker` covers the catalogue items that do (products, dishes), where a
 * shopkeeper listing forty items needs a tile rather than forty photographs.
 * Shops and product shelves are a handful of records entered once, so a photo
 * or nothing is the right choice there — but the two forms that edit them had
 * only a text box labelled "Logo URL", which asks an operator to host an image
 * somewhere themselves and paste the address, on a deployment that has
 * Cloudinary configured specifically so they do not have to.
 *
 * The box stays, below the button: an existing hosted URL is a legitimate
 * answer and pasting one was the only thing that worked until now.
 *
 * Upload is hidden rather than offered-then-refused when this deployment has no
 * image hosting, which is the same rule `ImagePicker` follows.
 */
export function ImageUploadField({
  label,
  value,
  folder,
  onChange,
  shape = "square",
  description,
  id,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadImage = useUploadImage();
  const { data } = useImagePresets();
  const uploadsEnabled = data?.uploadsEnabled ?? false;

  const pickFile = (file?: File) => {
    if (!file) return;

    uploadImage.mutate(
      { file, folder },
      {
        onError: (error) =>
          toast.error("Upload failed", {
            description: apiMessage(error, "Please try again."),
          }),
        onSuccess: (response) => onChange(response.data.url),
      },
    );
  };

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>

      <input
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        onChange={(event) => pickFile(event.target.files?.[0])}
        ref={fileInput}
        type="file"
      />

      <div className="flex items-start gap-4">
        {value ? (
          <img
            alt=""
            className={`${SHAPES[shape]} shrink-0 rounded-lg border object-cover`}
            src={value}
          />
        ) : (
          <div
            className={`bg-muted text-muted-foreground flex ${SHAPES[shape]} shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed`}
          >
            <ImageIcon className="size-5" />
            <span className="text-xs">No image</span>
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-2">
          {uploadsEnabled ? (
            <Button
              disabled={uploadImage.isPending}
              onClick={() => fileInput.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              {uploadImage.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <UploadIcon data-icon="inline-start" />
              )}
              {value ? "Replace image" : "Upload image"}
            </Button>
          ) : (
            <FieldDescription>
              Photo uploads are off — no image hosting is configured on this server. Paste a
              hosted image address below instead.
            </FieldDescription>
          )}

          {value ? (
            <Button onClick={() => onChange("")} size="sm" type="button" variant="ghost">
              Remove image
            </Button>
          ) : null}

          {uploadsEnabled ? (
            <FieldDescription>PNG, JPG, WebP or AVIF, up to 5 MB.</FieldDescription>
          ) : null}
        </div>
      </div>

      <Input
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://…"
        value={value}
      />

      <FieldDescription>{description ?? "Or paste the address of a hosted image."}</FieldDescription>
    </Field>
  );
}
