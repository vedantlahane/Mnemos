import { BrowserRouter, Routes, Route } from "react-router-dom"
import Layout from "./components/Layout"
import Dashboard from "./pages/Dashboard"
import NoteDetail from "./pages/NoteDetail"
import Search from "./pages/Search"
import Chat from "./pages/Chat"

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/note/:id" element={<NoteDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/chat" element={<Chat />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
