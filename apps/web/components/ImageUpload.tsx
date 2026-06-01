'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { validateProductImageFile } from '../lib/product-image-upload';
import type { ProductImageRejectReason } from '../lib/product-image-upload';

interface ImageUploadProps {
  name: string;
  required?: boolean;
  disabled?: boolean;
}

const ACCEPT = 'image/jpeg,image/png,image/webp';

const REJECT_COPY: Record<ProductImageRejectReason, string> = {
  empty: 'That file is empty. Pick another image.',
  bad_mime: 'Only JPEG, PNG, or WebP images are accepted.',
  too_large: 'Image is larger than 5 MB.',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Seller product image dropzone. A transparent, full-size <input type="file">
 * overlays the styled zone, so click-to-pick, native drag-drop (drop -> change),
 * and native `required` validation all work, and the File still submits through
 * the parent <form action={serverAction}> FormData unchanged. Client-side
 * validation is UX only; the server action re-validates authoritatively.
 */
export function ImageUpload({ name, required = false, disabled = false }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Revoke the object URL when it changes to a new value or on unmount.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function clearSelection() {
    if (inputRef.current) inputRef.current.value = '';
    setPreview(null);
    setFileMeta(null);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setError(null);
      clearSelection();
      return;
    }
    const result = validateProductImageFile({ type: file.type, size: file.size });
    if (!result.ok) {
      setError(REJECT_COPY[result.reason]);
      clearSelection();
      return;
    }
    setError(null);
    setPreview(URL.createObjectURL(file));
    setFileMeta({ name: file.name, size: file.size });
  }

  function onRemove() {
    setError(null);
    clearSelection();
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  function onDrop() {
    // The overlaid native input captures the file and fires onChange; we only
    // clear the visual highlight here.
    setDragOver(false);
  }

  const tone = disabled
    ? 'border-neutral-200 bg-neutral-50'
    : dragOver
      ? 'border-blue-500 bg-blue-50'
      : 'border-neutral-300 bg-neutral-0 hover:border-blue-400';

  return (
    <div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative flex min-h-[9rem] flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${tone}`}
      >
        <input
          ref={inputRef}
          id={name}
          type="file"
          name={name}
          accept={ACCEPT}
          required={required}
          disabled={disabled}
          onChange={onChange}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-label="Upload product image"
        />

        {preview ? (
          // z-20 sits above the z-10 input but is pointer-events-none, so clicking
          // the zone still reaches the input to re-pick; only Remove re-enables clicks.
          <div className="pointer-events-none relative z-20 flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Selected product image preview"
              className="max-h-40 rounded-lg object-contain"
            />
            {fileMeta && (
              <p className="text-xs text-neutral-600">
                {fileMeta.name} · {formatBytes(fileMeta.size)}
              </p>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="pointer-events-auto text-xs font-semibold text-red-700 hover:underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="pointer-events-none relative z-0 flex flex-col items-center">
            <span aria-hidden className="text-2xl">
              🖼️
            </span>
            <p className="mt-2 text-sm font-medium text-neutral-700">
              Click to upload or drag and drop
            </p>
            <p className="mt-1 text-xs text-neutral-500">JPEG, PNG, or WebP up to 5 MB</p>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
