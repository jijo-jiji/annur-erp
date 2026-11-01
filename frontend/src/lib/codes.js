// Every Data induk list gives each entry a short code, and the code is what staff read on the dashboards: short, and the same
// wherever it appears. A value that was typed in by hand (a campaign nobody added to the list, a voucher category written before
// the list existed) has no code and is shown as it was typed. Full names stay in Data induk, in exports, and in everything
// that is sent to parents.

// The code of the entry whose name is `label` in a Data induk list (the options from getMasterOptions)
export const codeOfLabel = (options, label) => options.find((o) => o.label === label)?.value ?? label ?? '';

// A class as staff read it: tingkatan, subject code and section (F5 FZ (A)). It is the server's class code without the teacher.
// Messages to parents keep the class's name (classLabel in domain.js).
export const classRef = (c) => `${c.form} ${c.subject} (${c.section})`;

// The code of the subject with this name (the subject list in the store)
export const subjectCodeOf = (subjects, name) => subjects.find((s) => s.name === name)?.code ?? name ?? '';
