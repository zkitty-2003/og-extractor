import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatInt } from "@/lib/utils";

interface TopUser {
    name: string;
    count: number;
    is_anonymous?: boolean;
    avatar_url?: string | null;
}

interface TopUsersListProps {
    users: TopUser[];
}

export function TopUsersList({ users }: TopUsersListProps) {
    return (
        <Card className="h-full border-slate-200 bg-white shadow-sm flex flex-col">
            <CardHeader className="pb-3 pt-4 px-5 border-b border-slate-50">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                    Top Active Users
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-0">
                {users.length === 0 ? (
                    <div className="flex h-32 flex-col items-center justify-center text-slate-400">
                        <p className="text-sm">No active users</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {users.map((user, index) => (
                            <div key={index} className="flex items-center justify-between p-4 transition-colors hover:bg-slate-50/50">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8 ring-2 ring-white shadow-sm">
                                        <AvatarImage src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`} />
                                        <AvatarFallback className="bg-slate-100 text-xs font-bold text-slate-500">
                                            {user.name.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold text-slate-700 truncate max-w-[120px]" title={user.name}>
                                            {user.name}
                                        </span>
                                        {user.is_anonymous && (
                                            <span className="text-[10px] text-slate-400 font-medium">Anonymous</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex flex-col items-end">
                                        <span className="text-sm font-bold font-mono text-slate-900">{formatInt(user.count)}</span>
                                        <span className="text-[10px] text-slate-400">msgs</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
