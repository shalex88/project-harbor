"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import type { ContactRecord } from "@/lib/domain";
import {
  findMentionQuery,
  insertContactMention,
  rankMentionContacts,
  reconcileMentionText,
  replaceMentionText,
  type MentionEditorValue,
  type MentionQuery,
} from "@/lib/work-item-contacts";
import { MentionText } from "./mention-text";

type NativeEditor = HTMLInputElement | HTMLTextAreaElement;
type PickerPosition = { top: number; left: number };

function pickerPosition(
  root: NativeEditor,
  picker: HTMLElement | null = null,
): PickerPosition {
  const anchor = root.getBoundingClientRect();
  const margin = 12;
  const gap = 6;
  const pickerBox = picker?.getBoundingClientRect();
  const width = pickerBox?.width ?? Math.min(360, window.innerWidth - 24);
  const height = pickerBox?.height ?? Math.min(320, window.innerHeight / 2);
  const direction = window.getComputedStyle(root).direction;
  const preferredLeft =
    direction === "rtl" ? anchor.right - width : anchor.left;
  const left = Math.min(
    Math.max(preferredLeft, margin),
    Math.max(margin, window.innerWidth - width - margin),
  );
  const below = anchor.bottom + gap;
  const above = anchor.top - height - gap;
  const top =
    below + height <= window.innerHeight - margin
      ? below
      : Math.max(margin, above);
  return { top, left };
}

export function ContactMentionEditor({
  label,
  value,
  contacts,
  multiline,
  maxLength,
  onChange,
}: {
  label: string;
  value: MentionEditorValue;
  contacts: ContactRecord[];
  multiline: boolean;
  maxLength: number;
  onChange: (value: MentionEditorValue) => void;
}): ReactElement {
  const editorRef = useRef<NativeEditor>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);
  const pendingCaret = useRef<number | null>(null);
  const pendingEditorFocus = useRef(false);
  const latestValueRef = useRef(value);
  const listboxId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<PickerPosition>({ top: 0, left: 0 });
  const results = useMemo(
    () => (query ? rankMentionContacts(contacts, query.query) : []),
    [contacts, query],
  );
  const previewMentions = useMemo(
    () =>
      value.mentions.map((mention, index) => ({
        ...mention,
        id: `${listboxId}-preview-${index}`,
        field: "title" as const,
      })),
    [listboxId, value.mentions],
  );
  const hasInteractiveMention = useMemo(() => {
    const contactIds = new Set(contacts.map((contact) => contact.id));
    return value.mentions.some((mention) => contactIds.has(mention.contactId));
  }, [contacts, value.mentions]);

  useLayoutEffect(() => {
    latestValueRef.current = value;
    const editor = editorRef.current;
    if (!editor) return;
    if (pendingEditorFocus.current) {
      pendingEditorFocus.current = false;
      const offset = pendingCaret.current ?? editor.value.length;
      pendingCaret.current = null;
      editor.focus();
      editor.setSelectionRange(offset, offset);
      return;
    }
    if (pendingCaret.current === null) return;
    const offset = pendingCaret.current;
    pendingCaret.current = null;
    editor.setSelectionRange(offset, offset);
  }, [isEditing, value]);

  const closePicker = () => {
    setQuery(null);
    setActiveIndex(0);
  };

  useEffect(() => {
    if (!query) return;
    const positionFrame = requestAnimationFrame(() => {
      if (editorRef.current) {
        setPosition(pickerPosition(editorRef.current, pickerRef.current));
      }
    });
    const closeForViewportChange = () => closePicker();
    const closeForOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !editorRef.current?.contains(target) &&
        !pickerRef.current?.contains(target)
      ) {
        closePicker();
      }
    };
    document.addEventListener("pointerdown", closeForOutsidePointer);
    window.addEventListener("resize", closeForViewportChange);
    window.addEventListener("scroll", closeForViewportChange, true);
    return () => {
      cancelAnimationFrame(positionFrame);
      document.removeEventListener("pointerdown", closeForOutsidePointer);
      window.removeEventListener("resize", closeForViewportChange);
      window.removeEventListener("scroll", closeForViewportChange, true);
    };
  }, [query]);

  const updatePicker = (
    nextValue: MentionEditorValue,
    caretOffset: number | null,
  ) => {
    if (isComposing.current || caretOffset === null || !editorRef.current) {
      return;
    }
    const nextQuery = findMentionQuery(
      nextValue.text,
      caretOffset,
      nextValue.mentions,
    );
    setQuery(nextQuery);
    setActiveIndex(0);
    if (nextQuery) setPosition(pickerPosition(editorRef.current));
  };

  const handleChange = (event: ChangeEvent<NativeEditor>) => {
    const text = event.currentTarget.value;
    const next = reconcileMentionText(latestValueRef.current, text);
    const caretOffset = event.currentTarget.selectionStart ?? text.length;
    latestValueRef.current = next;
    onChange(next);
    if (!isComposing.current) updatePicker(next, caretOffset);
  };

  const chooseContact = (contact: ContactRecord) => {
    if (!query) return;
    const inserted = insertContactMention(
      latestValueRef.current,
      query,
      contact,
    );
    latestValueRef.current = inserted.value;
    pendingCaret.current = inserted.caretOffset;
    onChange(inserted.value);
    closePicker();
  };

  const applyTextEdit = (replacement: string): boolean => {
    const editor = editorRef.current;
    if (!editor) return false;
    const startOffset = editor.selectionStart;
    const endOffset = editor.selectionEnd;
    if (startOffset === null || endOffset === null) return false;
    const current = latestValueRef.current;
    const retainedLength = current.text.length - (endOffset - startOffset);
    const acceptedReplacement = replacement.slice(
      0,
      Math.max(0, maxLength - retainedLength),
    );
    const next = replaceMentionText(
      current,
      startOffset,
      endOffset,
      acceptedReplacement,
    );
    const caretOffset = startOffset + acceptedReplacement.length;
    latestValueRef.current = next;
    pendingCaret.current = caretOffset;
    onChange(next);
    updatePicker(next, caretOffset);
    return true;
  };

  const removeBoundaryMention = (event: KeyboardEvent<NativeEditor>) => {
    const editor = editorRef.current;
    if (!editor) return false;
    const startOffset = editor.selectionStart;
    const endOffset = editor.selectionEnd;
    if (
      startOffset === null ||
      endOffset === null ||
      startOffset !== endOffset
    ) {
      return false;
    }
    const current = latestValueRef.current;
    const mention = current.mentions.find((candidate) =>
      event.key === "Backspace"
        ? candidate.endOffset === startOffset
        : candidate.startOffset === startOffset,
    );
    if (!mention) return false;
    event.preventDefault();
    const next = replaceMentionText(
      current,
      mention.startOffset,
      mention.endOffset,
      "",
    );
    latestValueRef.current = next;
    pendingCaret.current = mention.startOffset;
    onChange(next);
    closePicker();
    return true;
  };

  const handleKeyDown = (event: KeyboardEvent<NativeEditor>) => {
    if (event.key === "Backspace" || event.key === "Delete") {
      if (removeBoundaryMention(event)) return;
    }
    if (query && event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        results.length ? (index + 1) % results.length : 0,
      );
      return;
    }
    if (query && event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        results.length
          ? (index - 1 + results.length) % results.length
          : 0,
      );
      return;
    }
    if (query && event.key === "Enter") {
      event.preventDefault();
      const contact = results[activeIndex];
      if (contact) chooseContact(contact);
      return;
    }
    if (query && event.key === "Escape") {
      event.preventDefault();
      closePicker();
      return;
    }
    if (!multiline && event.key === "Enter") event.preventDefault();
  };

  const handlePaste = (event: ClipboardEvent<NativeEditor>) => {
    event.preventDefault();
    const plainText = event.clipboardData
      .getData("text/plain")
      .replace(multiline ? /\r\n?/g : /[\r\n]+/g, multiline ? "\n" : " ");
    applyTextEdit(plainText);
  };

  const handleCompositionEnd = () => {
    isComposing.current = false;
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (editor) {
        updatePicker(latestValueRef.current, editor.selectionStart);
      }
    });
  };

  const handleSelection = () => {
    const editor = editorRef.current;
    if (!isComposing.current && editor) {
      updatePicker(latestValueRef.current, editor.selectionStart);
    }
  };

  const handleBlur = () => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (
        active &&
        !editorRef.current?.contains(active) &&
        !pickerRef.current?.contains(active)
      ) {
        closePicker();
        setIsEditing(false);
      }
    });
  };

  const beginEditing = () => {
    pendingEditorFocus.current = true;
    setIsEditing(true);
  };

  const activeDescendant =
    query && results[activeIndex]
      ? `${listboxId}-option-${results[activeIndex].id}`
      : undefined;
  const showPreview = !isEditing && hasInteractiveMention;

  return (
    <div className="field mention-editor-field">
      <span className="field-label">{label}</span>
      <div className="mention-editor">
        {showPreview ? (
          <div
            className="mention-editor-preview"
            data-multiline={multiline}
            data-max-length={maxLength}
          >
            <button
              className="mention-editor-preview-edit-target"
              type="button"
              aria-label={`Edit ${label}`}
              onClick={beginEditing}
            />
            <span className="mention-editor-preview-content">
              <MentionText
                text={value.text}
                field="title"
                mentions={previewMentions}
                contacts={contacts}
              />
            </span>
          </div>
        ) : multiline ? (
          <textarea
            ref={(editor) => {
              editorRef.current = editor;
            }}
            className="mention-editor-input"
            role="combobox"
            value={value.text}
            maxLength={maxLength}
            dir="auto"
            aria-label={label}
            aria-autocomplete="list"
            aria-expanded={query !== null}
            aria-haspopup="listbox"
            aria-controls={query ? listboxId : undefined}
            aria-activedescendant={activeDescendant}
            data-multiline={multiline}
            data-max-length={maxLength}
            onFocus={() => setIsEditing(true)}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={handleSelection}
            onSelect={handleSelection}
            onMouseUp={handleSelection}
            onBlur={handleBlur}
            onPaste={handlePaste}
            onCompositionStart={() => {
              isComposing.current = true;
              closePicker();
            }}
            onCompositionEnd={handleCompositionEnd}
          />
        ) : (
          <input
            ref={(editor) => {
              editorRef.current = editor;
            }}
            className="mention-editor-input"
            type="text"
            role="combobox"
            required
            value={value.text}
            maxLength={maxLength}
            dir="auto"
            aria-label={label}
            aria-autocomplete="list"
            aria-expanded={query !== null}
            aria-haspopup="listbox"
            aria-controls={query ? listboxId : undefined}
            aria-activedescendant={activeDescendant}
            data-multiline={multiline}
            data-max-length={maxLength}
            onFocus={() => setIsEditing(true)}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={handleSelection}
            onSelect={handleSelection}
            onMouseUp={handleSelection}
            onBlur={handleBlur}
            onPaste={handlePaste}
            onCompositionStart={() => {
              isComposing.current = true;
              closePicker();
            }}
            onCompositionEnd={handleCompositionEnd}
          />
        )}
        {query ? (
          <div
            ref={pickerRef}
            id={listboxId}
            className="mention-picker"
            role="listbox"
            aria-label="Matching contacts"
            style={{ top: position.top, left: position.left }}
          >
            {results.length ? (
              results.map((contact, index) => (
                <button
                  id={`${listboxId}-option-${contact.id}`}
                  className={index === activeIndex ? "active" : undefined}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === activeIndex}
                  key={contact.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseContact(contact)}
                >
                  <bdi dir="auto">{contact.name}</bdi>
                  <bdi dir="auto">{contact.roleOrCompany}</bdi>
                </button>
              ))
            ) : (
              <span className="mention-picker-empty">No matching contacts</span>
            )}
          </div>
        ) : null}
      </div>
      <span className="field-hint">
        Type @ to mention a project contact · {value.text.length}/{maxLength}
      </span>
    </div>
  );
}
