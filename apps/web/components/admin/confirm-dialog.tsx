import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogCard, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ConfirmDialogProps = {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    tone?: "default" | "danger";
    onConfirm: () => void;
    onClose: () => void;
};

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = "Confirm",
    tone = "default",
    onConfirm,
    onClose,
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onClose={onClose}>
            <DialogCard>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant={tone === "danger" ? "danger" : "default"} onClick={onConfirm}>
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogCard>
        </Dialog>
    );
}
