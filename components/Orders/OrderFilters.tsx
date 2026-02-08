import React from 'react';
import { Category } from '../../types';
import { Input } from '../UIComponents';

interface OrderFiltersProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    dateFilter: string;
    onDateFilterChange: (value: string) => void;
    categoryFilter: string;
    onCategoryFilterChange: (value: string) => void;
    categories: Category[];
    datePreset: 'all' | 'today' | 'yesterday' | 'week' | 'month';
    onDatePresetChange: (preset: 'all' | 'today' | 'yesterday' | 'week' | 'month') => void;
    orderCountPerCategory: Record<string, number>;
}

export const OrderFilters: React.FC<OrderFiltersProps> = ({
    searchTerm,
    onSearchChange,
    dateFilter,
    onDateFilterChange,
    categoryFilter,
    onCategoryFilterChange,
    categories,
    datePreset,
    onDatePresetChange,


    orderCountPerCategory
}) => {
    return (
        <div className="flex flex-col gap-3 shrink-0">
            {/* Main Bar */}
            <div className="flex flex-col lg:flex-row justify-between items-center gap-3 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <h1 className="text-xl font-black text-gray-800 tracking-tight">Gestión de Pedidos</h1>

                </div>

                <div className="flex flex-wrap gap-2 w-full lg:w-auto items-center justify-end">
                    <div className="relative flex-1 sm:flex-none">
                        <Input
                            icon="search"
                            placeholder="Buscar folio o cliente..."
                            value={searchTerm}
                            onChange={e => onSearchChange(e.target.value)}
                            className="!py-1.5 text-xs w-full sm:w-64"
                        />
                    </div>

                    <Input
                        type="date"
                        value={dateFilter}
                        onChange={e => onDateFilterChange(e.target.value)}
                        className="!py-1.5 text-xs w-auto"
                    />

                    {/* Botones de sincronización manual eliminados para evitar confusión con Realtime */}

                </div>
            </div>

            {/* Presets and Categories */}
            <div className="flex flex-col gap-2 bg-gray-50/50 p-2 rounded-2xl border border-gray-100/50 shadow-inner">
                {/* Date Presets */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 px-1 scrollbar-none">
                    {[
                        { id: 'all' as const, label: 'Todo', icon: 'infinity' },
                        { id: 'today' as const, label: 'Hoy', icon: 'calendar-day' },
                        { id: 'yesterday' as const, label: 'Ayer', icon: 'calendar-minus' },
                        { id: 'week' as const, label: 'Esta Semana', icon: 'calendar-week' },
                        { id: 'month' as const, label: 'Este Mes', icon: 'calendar' },
                    ].map(preset => (
                        <button
                            key={preset.id}
                            onClick={() => onDatePresetChange(preset.id)}
                            className={`whitespace-nowrap px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5 border-2 ${datePreset === preset.id
                                ? 'bg-primary border-primary text-white shadow-md shadow-primary/20'
                                : 'bg-white text-gray-400 border-transparent hover:border-gray-200'
                                }`}
                        >
                            <i className={`fas fa-${preset.icon} text-[9px]`}></i>
                            {preset.label}
                        </button>
                    ))}
                </div>

                <div className="h-px bg-gray-200/50 mx-2"></div>

                {/* Categories */}
                <div className="flex gap-1.5 overflow-x-auto px-1 scrollbar-none">
                    <button
                        onClick={() => onCategoryFilterChange('all')}
                        className={`shrink-0 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase transition-all border-2 ${categoryFilter === 'all'
                            ? 'bg-gray-800 border-gray-800 text-white shadow-md'
                            : 'bg-white text-gray-500 border-transparent hover:border-gray-200'
                            }`}
                    >
                        <i className="fas fa-th-large mr-1.5"></i>Todas
                    </button>
                    {categories.map(cat => {
                        const isSelected = categoryFilter === cat.id;
                        const count = orderCountPerCategory[cat.id] || 0;

                        return (
                            <button
                                key={cat.id}
                                onClick={() => onCategoryFilterChange(cat.id)}
                                className={`shrink-0 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase transition-all border-2 flex items-center gap-2 ${isSelected
                                    ? 'shadow-md text-white'
                                    : 'bg-white text-gray-400 border-transparent hover:border-gray-200'
                                    }`}
                                style={{
                                    backgroundColor: isSelected ? cat.color : undefined,
                                    borderColor: isSelected ? cat.color : undefined,
                                    color: isSelected ? 'white' : cat.color
                                }}
                            >
                                <i className={`fas fa-${cat.icon || 'tag'}`}></i>
                                <span>{cat.name}</span>
                                <span className={`text-[8px] px-1.5 rounded-full font-black ${isSelected ? 'bg-white/30' : 'bg-gray-100 text-gray-400'}`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
