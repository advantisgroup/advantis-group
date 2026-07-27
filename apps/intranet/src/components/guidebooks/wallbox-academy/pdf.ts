import { RESEARCH_TASKS, SCENARIOS, SEG } from "./data";
import { DLAB } from "./progress";

import type { Chapter } from "./types";

function slug(title: string): string {
  return title.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
}

/** Client-only PDF export of a single chapter — mirrors the original tool's
 * "Kapitel als PDF" download. jsPDF is dynamically imported so it never
 * lands in the main bundle. */
export async function downloadChapterPdf(chapter: Chapter, index: number) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const width = 210 - 30;
  let y = 20;

  function line(text: string, size: number, bold: boolean, gap = 2) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(text, width) as string[];
    wrapped.forEach((l) => {
      if (y > 278) {
        doc.addPage();
        y = 20;
      }
      doc.text(l, 15, y);
      y += size * 0.5;
    });
    y += gap;
  }

  line("Wallbox Sales Academy", 10, true, 1);
  line(`Kapitel ${index + 1}: ${chapter.title}`, 16, true, 2);
  line(`Segment: ${SEG[chapter.segment]}`, 10, false, 4);

  chapter.body?.forEach((block) => {
    if (block.type === "diagram") {
      line(
        "(Prozessgrafik: 1 Leadliste > 2 Kontakt-Check > 3 Anruf > 4a Opportunity anlegen / 4b Account pflegen - siehe App)",
        10,
        false,
        2,
      );
    }
    if (block.type === "heading") line(block.text, 12, true, 1);
    if (block.type === "paragraph") line(block.text, 11, false, 2);
    if (block.type === "list") {
      block.items.forEach((item) => line(`- ${item}`, 11, false, 0.5));
    }
    if (block.type === "objections") {
      block.items.forEach(([objection, response]) => {
        line(`Einwand: "${objection}"`, 11, true, 0.5);
        line(`Antwort: ${response}`, 11, false, 2);
      });
    }
  });

  if (chapter.glossary) {
    chapter.glossary.forEach(([term, def]) => line(`${term}: ${def}`, 11, false, 0.5));
  }

  if (chapter.quiz) {
    y += 3;
    line("Wissens-Check (Fragen)", 12, true, 1);
    chapter.quiz.forEach((q, k) => line(`${k + 1}. ${q.question}`, 11, false, 1));
  }

  if (chapter.sim) {
    line("Vorbereitungsblatt Call-Simulator (Warm Leads)", 12, true, 2);
    line(
      "Ziel: qualifizierter Lead mit Wunsch nach Angebot oder Expertenberatung - oder Account-Pflege mit Follow-up (4b). Skills: offene Fragen, Quittungsmethode, Einwandbehandlung.",
      11,
      false,
      3,
    );
    SCENARIOS.forEach((s) => {
      line(`${s.title}  [${s.combo}]`, 11, true, 0.5);
      line(`Persona: ${s.persona}`, 10, false, 0.5);
      line(`Prozess-Ergebnis: ${s.outcome}`, 10, false, 0.5);
      line(`Zu erfassende Daten: ${s.targets.map((t) => DLAB[t]).join("; ")}`, 10, false, 3);
    });
  }

  if (chapter.research) {
    RESEARCH_TASKS.forEach((t) => {
      line(t.title, 12, true, 1);
      line(t.intro, 11, false, 1);
      t.links.forEach(([label, url]) => line(`Link: ${label} - ${url}`, 10, false, 0.5));
      t.questions.forEach((q, k) => line(`${k + 1}. ${q}`, 11, false, 1));
      y += 2;
    });
  }

  doc.save(`Kapitel-${index + 1}-${slug(chapter.title)}.pdf`);
}
