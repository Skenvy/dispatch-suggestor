/**
 * A 1:1 of the inputs expected by the action.yml
 */
export type ActionInputs = {
    github_token: string;
    trunk_branch: string;
    checkout_root: string;
    list_workflows_pagination_limit: number;
    comment_unique_identifier: string;
    inject_diff_paths: string;
    log_event_payload: boolean;
    log_workflow_triggers: boolean;
    vvv: boolean;
    DIT_only_use_injected_paths: boolean;
};
/**
 * Manages getting all the parameter inputs prior to running the action.
 * @returns Promise<ActionInputs | null>
 */
export declare function getActionInputs(): Promise<ActionInputs | null>;
/**
 * The function run by the action.
 * @param actionInputs
 * @returns
 */
export declare function entrypoint(actionInputs: ActionInputs): Promise<void>;
