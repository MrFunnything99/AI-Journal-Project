import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import "./index.css";
import { Queue } from "./pages/Queue/Queue";
import { Personaplex } from "./pages/Personaplex/Personaplex";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Personaplex />,
  },
  {
    path: "/queue",
    element: <Queue />,
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <RouterProvider router={router}/>
);
