# Mid-iteration Correction Math (summary)

This file summarizes the predictor-corrector loop for mid-iteration corrections and outline of composite loss J.

- Composite loss: J = alpha*J_err + beta*J_perf + gamma*J_transp
- Predictor step: x_{k+1/2} = x_k - eta_k * grad_x J_sur
- Corrector: x_{k+1} = x_{k+1/2} + lambda_k * C f_k
- Update prompt params: p_{k+1} = p_k - mu_k * grad_p J
- Self-refinement prob: P_refine = min(1, kappa0 + kappa1 * e_k)

The repo contains a prototype and examples of how to encode these loops in an IDE/assistant-driven pipeline.
