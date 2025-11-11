import FeaturedGrid from "@/sections/FeaturedGrid";
import ClientLogosRotating from "@/sections/ClientLogosRotating";
import CategoriesTeaser from "@/sections/CategoriesTeaser";
import SampleCTA from '@/sections/SampleCTA';
import Hero from "@/sections/Hero";
import HomePageBubbles from "@/components/HomePageBubbles";

export default function Home() {
    return (
        <>
            <HomePageBubbles />
            <Hero />
            <ClientLogosRotating />
            <CategoriesTeaser />
            <FeaturedGrid />
            <SampleCTA />
        </>
    );
}