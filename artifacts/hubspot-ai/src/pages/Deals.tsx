import CrmView from "@/components/CrmView";
import ExportButton from "@/components/ExportButton";

export default function Deals() {
  return (
    <CrmView
      type="deals"
      extraActions={
        <ExportButton
          href="/api/exports/pipeline.xlsx"
          filename="pipeline-export.xlsx"
          label="Esporta Pipeline"
          testId="button-export-pipeline"
        />
      }
    />
  );
}
