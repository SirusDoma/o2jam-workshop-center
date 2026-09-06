import { useState, type FormEvent } from 'react';
import { CloseButton, Overlay } from '../Overlay';
import type { Difficulty, EditorChart, EditorDocument } from '../../features/note-tool/types';

const DIFFICULTIES: Difficulty[] = ['EX', 'NX', 'HX'];

export function CopyEventsDialog({ document, difficulty, onCopy, onClose }: {
  document: EditorDocument;
  difficulty: Difficulty;
  onCopy: (from: Difficulty, to: Difficulty) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(difficulty);
  const [to, setTo] = useState<Difficulty>(difficulty === 'EX' ? 'NX' : 'EX');
  const [replacing, setReplacing] = useState(false);
  const sourceCount = eventCount(document[from]);
  const destinationCount = eventCount(document[to]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (from === to || sourceCount === 0) return;
    if (destinationCount > 0 && !replacing) {
      setReplacing(true);
    } else {
      onCopy(from, to);
    }
  };

  return (
    <Overlay label={replacing ? `Replace ${to} notes?` : 'Copy notes'} width="narrow" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="overlay-head">
          <div className="oh-main"><div className="oh-row"><span className="overlay-title">{replacing ? `Replace ${to} notes?` : 'Copy notes'}</span></div></div>
          <div className="overlay-actions"><CloseButton onClose={onClose} /></div>
        </div>
        <div className="overlay-body nt-copy-events-body">
          {replacing ? (
            <p>Replace all {destinationCount} notes in {to} with {sourceCount} notes from {from}? You can undo this change.</p>
          ) : (
            <>
              <div className="nt-field-row">
                <label className="nt-field">
                  <span>From</span>
                  <select className="selctl" value={from} autoFocus onChange={(event) => {
                    const next = event.currentTarget.value as Difficulty;
                    if (next === to) setTo(from);
                    setFrom(next);
                  }}>
                    {DIFFICULTIES.map((id) => <option key={id}>{id}</option>)}
                  </select>
                </label>
                <label className="nt-field">
                  <span>To</span>
                  <select className="selctl" value={to} onChange={(event) => setTo(event.currentTarget.value as Difficulty)}>
                    {DIFFICULTIES.filter((id) => id !== from).map((id) => <option key={id}>{id}</option>)}
                  </select>
                </label>
              </div>
            </>
          )}
        </div>
        <div className="dialogfoot nt-copy-events-footer">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className={`btn ${replacing ? 'danger' : 'primary'}`} type="submit" disabled={sourceCount === 0}>{replacing ? 'Replace notes' : 'Copy notes'}</button>
        </div>
      </form>
    </Overlay>
  );
}

function eventCount(chart: EditorChart): number {
  return chart.notes.length + chart.autoplayNotes.length + chart.bpmChanges.length + chart.measureFractions.length;
}
