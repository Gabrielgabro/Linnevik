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
            <div className="mt-12 w-full">
                <ClientLogosRotating />
            </div>
            <CategoriesTeaser />
            <FeaturedGrid />
            <SampleCTA />
        </>
    );
}