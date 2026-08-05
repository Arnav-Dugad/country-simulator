import { useUiStore } from '../../store/uiStore';
import { Modal } from '../ui/primitives';

const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ['Space'], action: 'Play / pause auto-advance' },
  { keys: ['→'], action: 'Advance one month' },
  { keys: ['N'], action: 'Advance one month' },
  { keys: ['Z'], action: 'Rewind one month' },
  { keys: ['Ctrl', 'K'], action: 'Open the command palette' },
  { keys: ['1'], action: 'Situation Room' },
  { keys: ['2'], action: 'Economy' },
  { keys: ['3'], action: 'Treasury' },
  { keys: ['4'], action: 'Legislation' },
  { keys: ['5'], action: 'Research' },
  { keys: ['6'], action: 'Construction' },
  { keys: ['7'], action: 'Defence' },
  { keys: ['8'], action: 'Diplomacy' },
  { keys: ['9'], action: 'Crisis Room' },
  { keys: ['?'], action: 'This sheet' },
  { keys: ['Esc'], action: 'Close any dialog' },
];

/** The keyboard reference, opened with `?`. */
export function ShortcutSheet() {
  const open = useUiStore((s) => s.helpOpen);
  const setHelp = useUiStore((s) => s.setHelp);

  return (
    <Modal
      open={open}
      onClose={() => setHelp(false)}
      title="Keyboard shortcuts"
      subtitle="Everything here works from any panel, except while typing in a field."
      size="md"
    >
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {SHORTCUTS.map((shortcut) => (
          <li
            key={shortcut.action + shortcut.keys.join()}
            className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2"
          >
            <span className="text-xs text-slate-300">{shortcut.action}</span>
            <span className="flex shrink-0 items-center gap-1">
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className="num rounded border border-white/10 bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-slate-200"
                >
                  {key}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Rewind holds the last twelve months in memory and is disabled in ironman campaigns. It is
        never written to a save, so it will not survive reloading the page.
      </p>
    </Modal>
  );
}
