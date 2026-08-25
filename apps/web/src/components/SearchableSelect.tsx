import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  id: string;
  label: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  emptyValueLabel?: string;
  clearLabel?: string;
  required?: boolean;
  loading?: boolean;
  errorMessage?: string;
};

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

export function SearchableSelect({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
  emptyValueLabel,
  clearLabel,
  required = false,
  loading = false,
  errorMessage,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const term = normalizeSearch(search);
    return term
      ? options.filter((option) => normalizeSearch(option.label).includes(term))
      : options;
  }, [options, search]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function choose(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="min-w-0 text-sm font-semibold">
      <label id={`${id}-label`} htmlFor={`${id}-trigger`}>
        {label}
      </label>
      <button
        id={`${id}-trigger`}
        type="button"
        className="input mt-1 flex min-h-12 w-full min-w-0 items-center justify-between gap-3 text-left font-normal"
        aria-labelledby={`${id}-label ${id}-trigger`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required || undefined}
        onClick={() => setOpen(true)}
      >
        <span className={clsx("min-w-0 truncate", !selected && "text-slate-500")}>
          {selected?.label ?? emptyValueLabel ?? placeholder}
        </span>
        <span aria-hidden="true" className="shrink-0 text-slate-500">
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
            role="presentation"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${id}-dialog-title`}
              className="flex max-h-[calc(100dvh-0.5rem)] w-full min-w-0 flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[min(80dvh,40rem)] sm:max-w-lg sm:rounded-2xl"
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-4">
                <h2 id={`${id}-dialog-title`} className="min-w-0 text-base font-bold">
                  {label}
                </h2>
                <button
                  type="button"
                  className="min-h-11 min-w-11 rounded-xl border border-slate-200 text-xl"
                  aria-label="Fechar lista"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </header>
              <div className="shrink-0 border-b border-slate-200 p-3">
                <input
                  ref={searchRef}
                  type="search"
                  inputMode="search"
                  className="input min-h-12 w-full"
                  placeholder={`Pesquisar ${label.toLocaleLowerCase("pt-BR")}`}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div
                className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-2"
                role="listbox"
                aria-labelledby={`${id}-dialog-title`}
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {(clearLabel || emptyValueLabel) && !search && (
                  <button
                    type="button"
                    role="option"
                    aria-selected={!value}
                    className={clsx(
                      "mb-1 flex min-h-12 w-full items-center rounded-xl px-3 text-left font-medium",
                      !value ? "bg-brand-50 text-brand-800" : "hover:bg-slate-100",
                    )}
                    onClick={() => choose("")}
                  >
                    {clearLabel || emptyValueLabel}
                  </button>
                )}
                {loading && <p className="p-3 text-slate-500">Carregando cadastros…</p>}
                {!loading && errorMessage && <p className="rounded-xl bg-red-50 p-3 text-red-700">{errorMessage}</p>}
                {!loading && !errorMessage && filteredOptions.length === 0 && (
                  <p className="p-3 text-slate-500">Nenhum cadastro encontrado.</p>
                )}
                {!loading && !errorMessage &&
                  filteredOptions.map((option) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={option.value === value}
                      className={clsx(
                        "mb-1 flex min-h-12 w-full items-center rounded-xl px-3 text-left font-medium",
                        option.value === value
                          ? "bg-brand-50 text-brand-800"
                          : "hover:bg-slate-100 focus:bg-slate-100",
                      )}
                      key={option.value}
                      onClick={() => choose(option.value)}
                    >
                      <span className="min-w-0 break-words">{option.label}</span>
                    </button>
                  ))}
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
