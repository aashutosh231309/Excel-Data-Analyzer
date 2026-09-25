import { CloudUpload, FileSpreadsheet, FolderOpen, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { EXCEL_EXTENSION_LABEL } from '@/lib/excel';
import type { FileSelectionController } from '@/hooks/useFileSelection';
import type { ExcelFileSelection } from '@shared/api';
import { formatFileSize } from '@/utils/format';

interface FileImportCardProps {
  controller: FileSelectionController;
}

/**
 * Primary import surface of the application.
 *
 * Stage 1 stops at selecting and validating the file: no workbook content is
 * read yet, and the UI says so explicitly instead of implying that data was
 * processed.
 */
export function FileImportCard({ controller }: FileImportCardProps) {
  const { file, isBusy, browse, acceptDroppedFiles, clear } = controller;

  return (
    <FileDropZone
      label="Excel file drop zone"
      onFilesDropped={(files) => {
        void acceptDroppedFiles(files);
      }}
    >
      {file ? (
        <SelectedFilePanel file={file} isBusy={isBusy} onBrowse={browse} onClear={clear} />
      ) : (
        <ImportPrompt isBusy={isBusy} onBrowse={browse} />
      )}
    </FileDropZone>
  );
}

interface ImportPromptProps {
  isBusy: boolean;
  onBrowse: () => void;
}

function ImportPrompt({ isBusy, onBrowse }: ImportPromptProps) {
  return (
    <>
      <span className="flex h-14 w-14 items-center justify-center rounded-card bg-accent-decorative transition-transform duration-200 ease-smooth group-hover/drop:scale-105">
        <CloudUpload className="h-7 w-7 text-accent" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold tracking-tight text-content">Upload your Excel file</h2>
      <p className="text-[13px] text-content-secondary">Drag &amp; drop your spreadsheet here</p>
      <p className="text-[11px] uppercase tracking-wider text-content-muted">or</p>
      <Button icon={FolderOpen} loading={isBusy} onClick={onBrowse}>
        Browse Excel File
      </Button>
      <p className="text-[11px] text-content-muted">Supported formats: {EXCEL_EXTENSION_LABEL}</p>
    </>
  );
}

interface SelectedFilePanelProps {
  file: ExcelFileSelection;
  isBusy: boolean;
  onBrowse: () => void;
  onClear: () => void;
}

function SelectedFilePanel({ file, isBusy, onBrowse, onClear }: SelectedFilePanelProps) {
  return (
    <div className="w-full max-w-xl text-left">
      <div className="flex items-center gap-4 rounded-card border border-surface-border bg-surface-elevated p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent-decorative">
          <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-content" title={file.name}>
            {file.name}
          </p>
          <p className="mt-1 truncate text-[11px] text-content-muted" title={file.path}>
            {file.path}
          </p>
          <p className="mt-1.5 flex items-center gap-2 text-[11px] text-content-muted">
            <Badge variant="accent">{file.extension.toUpperCase()}</Badge>
            <span>{formatFileSize(file.sizeInBytes)}</span>
          </p>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-content-muted">
        The spreadsheet is ready for analysis. Reading rows, filtering and totals are implemented in
        the next stage — no data has been processed yet.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" icon={FolderOpen} loading={isBusy} onClick={onBrowse}>
          Choose another file
        </Button>
        <Button variant="ghost" icon={X} onClick={onClear}>
          Clear selection
        </Button>
      </div>
    </div>
  );
}
