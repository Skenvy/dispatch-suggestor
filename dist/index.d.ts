/**
 * A 1:1 of the inputs expected by the action.yml
 */
export type ActionInputs = {
    github_token: string;
    trunk_branch: string;
    checkout_root: string;
    log_event_payload: string;
    log_workflow_triggers: string;
};
/**
 * Manages getting all the parameter inputs prior to running the action.
 * @returns Promise<ActionInputs | null>
 */
export declare function getActionInputs(): Promise<ActionInputs | null>;
export declare function run(actionInputs: ActionInputs): Promise<void>;
