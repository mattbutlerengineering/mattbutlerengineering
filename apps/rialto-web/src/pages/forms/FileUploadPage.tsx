import { useState } from "react";
import { DataList, FileUpload } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

export function FileUploadPage() {
  const [menus, setMenus] = useState<File[]>([]);

  return (
    <ComponentPageLayout
      name="File Upload"
      description="Pick or drop documents, such as a menu PDF or a guest import CSV. Each file is checked against type and size before your app sees it, and every change is announced to screen readers."
    >
      <Section title="Multiple PDFs">
        <FileUpload
          label="Menus"
          accept=".pdf"
          multiple
          maxFiles={3}
          maxSize={5 * 1024 * 1024}
          hint="PDF, up to 3 files, 5MB each"
          value={menus}
          onFilesChange={setMenus}
        />
        <p>Files ready to upload: {menus.length}</p>
      </Section>

      <Section title="Single file">
        <FileUpload label="Guest import" accept=".csv,text/csv" hint="CSV, one file" />
      </Section>

      <Section title="States">
        <div className={styles.stack}>
          <FileUpload label="With error" error="Add at least one menu" />
          <FileUpload label="Disabled" disabled />
        </div>
      </Section>

      <Section title="Props">
        <PropsTable component="FileUpload" />
      </Section>

      <Section title="Accessibility">
        <DataList
          items={[
            {
              label: "Browse",
              value: "A real button; Enter or Space opens the native file picker",
            },
            {
              label: "Drop zone",
              value: "Not a second Tab stop; dropping adds files like picking",
            },
            {
              label: "Input",
              value: "Labelled, aria-invalid and aria-describedby for hint and error",
            },
            {
              label: "Announcements",
              value: "Additions, rejections and removals in a polite live region",
            },
            {
              label: "Removal",
              value: "Each file has a named remove button; focus returns to Choose files",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

FileUploadPage.displayName = "FileUploadPage";
