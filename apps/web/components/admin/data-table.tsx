import { Table, TBody, TH, THead, TR, TD } from "@/components/ui/table";

type DataTableColumn = {
    key: string;
    label: string;
    className?: string;
};

type DataTableProps = {
    columns: DataTableColumn[];
    rowCount: number;
    children: React.ReactNode;
    emptyLabel?: string;
    loading?: boolean;
};

export function DataTable({ columns, rowCount, children, emptyLabel, loading }: DataTableProps) {
    return (
        <div className="rounded-lg border border-border bg-white">
            <Table>
                <THead>
                    <TR>
                        {columns.map((column) => (
                            <TH key={column.key} className={column.className}>
                                {column.label}
                            </TH>
                        ))}
                    </TR>
                </THead>
                <TBody>
                    {loading ? (
                        Array.from({ length: 4 }).map((_, idx) => (
                            <TR key={`skeleton-${idx}`} className="animate-pulse">
                                {columns.map((column) => (
                                    <TD key={`${column.key}-${idx}`}>
                                        <div className="h-3 w-full rounded bg-muted/60" />
                                    </TD>
                                ))}
                            </TR>
                        ))
                    ) : rowCount === 0 ? (
                        <TR>
                            <TD colSpan={columns.length} className="py-8 text-center text-sm text-muted-foreground">
                                {emptyLabel ?? "No records found."}
                            </TD>
                        </TR>
                    ) : (
                        children
                    )}
                </TBody>
            </Table>
        </div>
    );
}
