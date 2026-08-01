"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
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
import { ContactActionTrigger } from "./contact-actions";

type PickerPosition = { top: number; left: number };

function readEditorValue(root: HTMLElement): MentionEditorValue {
  let text = "";
  const mentions: MentionEditorValue["mentions"] = [];

  const readNode = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.contactId) {
      const label = node.dataset.contactLabel ?? node.textContent ?? "";
      const startOffset = text.length;
      text += label;
      mentions.push({
        contactId: node.dataset.contactId,
        startOffset,
        endOffset: text.length,
      });
      return;
    }
    if (node.tagName === "BR") {
      text += "\n";
      return;
    }
    for (const child of node.childNodes) readNode(child);
  };

  for (const child of root.childNodes) readNode(child);
  return { text, mentions };
}

function currentCaretOffset(root: HTMLElement): number | null {
  const offsets = currentSelectionOffsets(root);
  return offsets && offsets.startOffset === offsets.endOffset
    ? offsets.startOffset
    : null;
}

function currentSelectionOffsets(
  root: HTMLElement,
): { startOffset: number; endOffset: number } | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null;
  }
  const prefix = document.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const startOffset = prefix.toString().length;
  prefix.setEnd(range.endContainer, range.endOffset);
  return { startOffset, endOffset: prefix.toString().length };
}

function setCaretOffset(root: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let consumed = 0;

  for (const child of root.childNodes) {
    const element = child instanceof HTMLElement ? child : null;
    const length = element?.dataset.contactLabel?.length ?? child.textContent?.length ?? 0;
    if (element?.dataset.contactId) {
      if (offset <= consumed) {
        range.setStartBefore(child);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      if (offset <= consumed + length) {
        range.setStartAfter(child);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
    } else if (offset <= consumed + length) {
      const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
      let localOffset = offset - consumed;
      let textNode = walker.nextNode();
      while (textNode) {
        const nodeLength = textNode.textContent?.length ?? 0;
        if (localOffset <= nodeLength) {
          range.setStart(textNode, localOffset);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
        localOffset -= nodeLength;
        textNode = walker.nextNode();
      }
    }
    consumed += length;
  }

  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function pickerPosition(
  root: HTMLElement,
  picker: HTMLElement | null = null,
): PickerPosition {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const rect = range?.getBoundingClientRect();
  const anchor = rect && (rect.width || rect.height)
    ? rect
    : root.getBoundingClientRect();
  const margin = 12;
  const gap = 6;
  const pickerBox = picker?.getBoundingClientRect();
  const width = pickerBox?.width ?? Math.min(360, window.innerWidth - 24);
  const height = pickerBox?.height ?? Math.min(320, window.innerHeight / 2);
  const left = Math.min(
    Math.max(anchor.left, margin),
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

function editorParts(
  value: MentionEditorValue,
  contacts: ContactRecord[],
): ReactNode[] {
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const mention of [...value.mentions].sort(
    (left, right) => left.startOffset - right.startOffset,
  )) {
    const contact = contactsById.get(mention.contactId);
    if (
      !contact ||
      mention.startOffset < cursor ||
      mention.endOffset <= mention.startOffset ||
      mention.endOffset > value.text.length
    ) {
      continue;
    }
    if (mention.startOffset > cursor) {
      parts.push(
        <bdi dir="auto" key={`text-${cursor}`}>
          {value.text.slice(cursor, mention.startOffset)}
        </bdi>,
      );
    }
    const label = `@${contact.name}`;
    parts.push(
      <span
        className="contact-mention-editor-token"
        contentEditable={false}
        data-contact-id={contact.id}
        data-contact-label={label}
        key={`${contact.id}-${mention.startOffset}`}
      >
        <ContactActionTrigger
          contact={contact}
          label={label}
          className="contact-mention-trigger contact-mention"
        />
      </span>,
    );
    cursor = mention.endOffset;
  }
  if (cursor < value.text.length || parts.length === 0) {
    parts.push(
      <bdi dir="auto" key={`text-${cursor}`}>
        {value.text.slice(cursor)}
      </bdi>,
    );
  }
  return parts;
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
  const editorRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);
  const pendingCaret = useRef<number | null>(null);
  const listboxId = useId();
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<PickerPosition>({ top: 0, left: 0 });
  const results = useMemo(
    () => (query ? rankMentionContacts(contacts, query.query) : []),
    [contacts, query],
  );

  useEffect(() => {
    if (pendingCaret.current === null || !editorRef.current) return;
    const offset = pendingCaret.current;
    pendingCaret.current = null;
    const frame = requestAnimationFrame(() => {
      if (editorRef.current) setCaretOffset(editorRef.current, offset);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

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

  const updatePicker = (nextValue: MentionEditorValue, caretOffset: number | null) => {
    if (isComposing.current || caretOffset === null || !editorRef.current) return;
    const nextQuery = findMentionQuery(
      nextValue.text,
      caretOffset,
      nextValue.mentions,
    );
    setQuery(nextQuery);
    setActiveIndex(0);
    if (nextQuery) setPosition(pickerPosition(editorRef.current));
  };

  const normalizedDomValue = (): MentionEditorValue | null => {
    if (!editorRef.current) return null;
    const parsed = readEditorValue(editorRef.current);
    const next =
      parsed.mentions.length > 0 || value.mentions.length === 0
        ? parsed
        : reconcileMentionText(value, parsed.text);
    const text = next.text.slice(0, maxLength);
    return {
      text,
      mentions: next.mentions.filter((mention) => mention.endOffset <= text.length),
    };
  };

  const syncFromDom = (updateMentionPicker = true) => {
    const next = normalizedDomValue();
    if (!next || !editorRef.current) return;
    const caretOffset = Math.min(
      currentCaretOffset(editorRef.current) ?? next.text.length,
      next.text.length,
    );
    pendingCaret.current = caretOffset;
    onChange(next);
    if (updateMentionPicker) updatePicker(next, caretOffset);
  };

  const chooseContact = (contact: ContactRecord) => {
    if (!query) return;
    const inserted = insertContactMention(value, query, contact);
    pendingCaret.current = inserted.caretOffset;
    onChange(inserted.value);
    closePicker();
  };

  const applyTextEdit = (replacement: string): boolean => {
    if (!editorRef.current) return false;
    const offsets = currentSelectionOffsets(editorRef.current);
    if (!offsets) return false;
    const retainedLength =
      value.text.length - (offsets.endOffset - offsets.startOffset);
    const acceptedReplacement = replacement.slice(
      0,
      Math.max(0, maxLength - retainedLength),
    );
    const next = replaceMentionText(
      value,
      offsets.startOffset,
      offsets.endOffset,
      acceptedReplacement,
    );
    const caretOffset = offsets.startOffset + acceptedReplacement.length;
    pendingCaret.current = caretOffset;
    onChange(next);
    updatePicker(next, caretOffset);
    return true;
  };

  const removeBoundaryMention = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!editorRef.current || !window.getSelection()?.isCollapsed) return false;
    const caretOffset = currentCaretOffset(editorRef.current);
    if (caretOffset === null) return false;
    const mention = value.mentions.find((candidate) =>
      event.key === "Backspace"
        ? candidate.endOffset === caretOffset
        : candidate.startOffset === caretOffset,
    );
    if (!mention) return false;
    event.preventDefault();
    const nextText =
      value.text.slice(0, mention.startOffset) + value.text.slice(mention.endOffset);
    const next = reconcileMentionText(value, nextText);
    pendingCaret.current = mention.startOffset;
    onChange(next);
    closePicker();
    return true;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Backspace" || event.key === "Delete") {
      if (removeBoundaryMention(event)) return;
    }
    if (query && event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index + 1) % results.length : 0));
      return;
    }
    if (query && event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        results.length ? (index - 1 + results.length) % results.length : 0,
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

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const plainText = event.clipboardData
      .getData("text/plain")
      .replace(multiline ? /\r\n?/g : /[\r\n]+/g, multiline ? "\n" : " ");
    applyTextEdit(plainText);
  };

  const handleCompositionEnd = () => {
    isComposing.current = false;
    requestAnimationFrame(() => syncFromDom(true));
  };

  const handleSelection = () => {
    if (!isComposing.current && editorRef.current) {
      updatePicker(value, currentCaretOffset(editorRef.current));
    }
  };

  return (
    <div className="field mention-editor-field">
      <span className="field-label">{label}</span>
      <div className="mention-editor">
        <div
          ref={editorRef}
          className="mention-editor-input"
          role="combobox"
          contentEditable
          suppressContentEditableWarning
          dir="auto"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={query !== null}
          aria-haspopup="listbox"
          aria-controls={query ? listboxId : undefined}
          aria-activedescendant={
            query && results[activeIndex]
              ? `${listboxId}-option-${results[activeIndex].id}`
              : undefined
          }
          data-multiline={multiline}
          data-max-length={maxLength}
          onBeforeInput={(event: FormEvent<HTMLDivElement>) => {
            const inputType = (event.nativeEvent as InputEvent).inputType;
            if (inputType !== "insertParagraph" && inputType !== "insertLineBreak") {
              return;
            }
            if (!multiline) {
              event.preventDefault();
              return;
            }
            event.preventDefault();
            applyTextEdit("\n");
          }}
          onInput={() => syncFromDom(!isComposing.current)}
          onKeyDown={handleKeyDown}
          onKeyUp={() => {
            if (!isComposing.current && editorRef.current) {
              updatePicker(value, currentCaretOffset(editorRef.current));
            }
          }}
          onMouseUp={handleSelection}
          onBlur={() => {
            requestAnimationFrame(() => {
              const active = document.activeElement;
              if (
                active &&
                !editorRef.current?.contains(active) &&
                !pickerRef.current?.contains(active)
              ) {
                closePicker();
              }
            });
          }}
          onPaste={handlePaste}
          onCompositionStart={() => {
            isComposing.current = true;
            closePicker();
          }}
          onCompositionEnd={handleCompositionEnd}
        >
          {editorParts(value, contacts)}
        </div>
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
