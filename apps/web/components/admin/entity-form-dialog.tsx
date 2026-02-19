import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogCard, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type EntityFormDialogProps = {
    open: boolean;
    title: string;
    description?: string;
    submitLabel?: string;
    onSubmit: () => void;
    onClose: () => void;
    children: React.ReactNode;
};

export function EntityFormDialog({
    open,
    title,
    description,
    submitLabel = "Save",
    onSubmit,
    onClose,
    children,
}: EntityFormDialogProps) {
    return (
        <Dialog open={open} onClose={onClose}>
            <DialogCard>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSubmit();
                    }}
                >
                    <DialogHeader>
                        <div>
                            <DialogTitle>{title}</DialogTitle>
                            {description ? (
                                <p className="text-xs text-muted-foreground">{description}</p>
                            ) : null}
                        </div>
                    </DialogHeader>
                    <DialogBody>{children}</DialogBody>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit">{submitLabel}</Button>
                    </DialogFooter>
                </form>
            </DialogCard>
        </Dialog>
    );
}
