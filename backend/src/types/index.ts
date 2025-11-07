export interface User {
  id: number;
  name: string;
  password_hash: string;
  role: 'admin' | 'teamleiter' | 'staff';
  created_at: Date;
}

export interface Event {
  id: number;
  name: string;
  description?: string;
  start_date: Date;
  days: number;
  created_by: number;
  is_template: boolean;
  is_template_suggestion: boolean;
  created_at: Date;
}

export interface EventInstance {
  id: number;
  event_id: number;
  instance_number: number;
  start_date: Date;
  created_at: Date;
}

export interface ProgramItem {
  id: number;
  event_id: number;
  day_number: number;
  time: string;
  title: string;
  description?: string;
  created_at: Date;
}

export interface Task {
  id: number;
  event_id: number;
  program_item_id?: number;
  day_number: number;
  title: string;
  description?: string;
  scheduled_time?: string;
  reminder_minutes: number;
  created_at: Date;
}

export interface TaskAssignment {
  id: number;
  task_id: number;
  event_instance_id: number;
  user_id: number;
  completed: boolean;
  completed_at?: Date;
  created_at: Date;
}

export interface PushSubscription {
  id: number;
  user_id: number;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  created_at: Date;
}

// Request/Response DTOs
export interface LoginRequest {
  name: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    name: string;
    role: string;
  };
}

export interface CreateEventRequest {
  name: string;
  description?: string;
  start_date: string;
  days: number;
  instance_count: number;
  is_template?: boolean;
}

export interface CreateTaskRequest {
  event_id: number;
  program_item_id?: number;
  day_number: number;
  title: string;
  description?: string;
  scheduled_time?: string;
  reminder_minutes?: number;
}

export interface AssignTaskRequest {
  task_id: number;
  event_instance_id: number;
  user_ids: number[];
}

export interface TaskWithAssignments extends Task {
  assigned_users?: User[];
  is_completed?: boolean;
  event_name?: string;
  event_instance_start_date?: Date;
}
