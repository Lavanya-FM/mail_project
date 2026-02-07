import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';
import { Email } from '../types/email';

interface SortableTabProps {
    email: Email;
    isActive: boolean;
    onActivate: () => void;
    onClose: (e: React.MouseEvent) => void;
}

export function SortableTab({ email, isActive, onActivate, onClose }: SortableTabProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: String(email.id) });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : 'auto',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all duration-200 min-w-0 max-w-xs group border select-none ${isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 ring-1 ring-blue-500/20'
                    : 'bg-gray-50 dark:bg-slate-800 border-transparent hover:border-gray-300 dark:hover:border-slate-600'
                }`}
            onClick={onActivate}
        >
            <span
                className={`text-xs font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-slate-400'
                    }`}
            >
                {email.subject || 'No Subject'}
            </span>
            <button
                onClick={onClose}
                className="p-0.5 rounded-full hover:bg-gray-300 dark:hover:bg-slate-600 transition opacity-0 group-hover:opacity-100"
            >
                <X className="w-3 h-3 text-gray-500 dark:text-slate-400" />
            </button>
        </div>
    );
}
